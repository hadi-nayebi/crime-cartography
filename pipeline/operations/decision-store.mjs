import {randomUUID} from "node:crypto";
import {mkdirSync, readFileSync} from "node:fs";
import {dirname} from "node:path";
import {DatabaseSync} from "node:sqlite";

const JSON_TEXT = (value) => JSON.stringify(value ?? null);
const PARSE_JSON = (value, fallback) => {
  try {
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
};

export function createDecisionStore({databasePath, seedPath = null}) {
  mkdirSync(dirname(databasePath), {recursive: true});
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS decision_requests (
      id TEXT PRIMARY KEY,
      area TEXT NOT NULL,
      priority TEXT NOT NULL,
      prompt TEXT NOT NULL,
      context TEXT NOT NULL,
      why_hadi TEXT NOT NULL DEFAULT '',
      recommendation TEXT NOT NULL DEFAULT '',
      response_type TEXT NOT NULL,
      choices_json TEXT NOT NULL,
      artifact_revision TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'answered', 'acknowledged', 'resolved', 'deferred')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS decision_responses (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES decision_requests(id),
      idempotency_key TEXT NOT NULL UNIQUE,
      choice_id TEXT,
      note TEXT NOT NULL,
      artifact_revision TEXT NOT NULL,
      operator TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wake_outbox (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      record_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      claimed_at TEXT,
      claimed_by TEXT,
      completed_at TEXT,
      UNIQUE(topic, record_id)
    );
  `);
  const requestColumns = new Set(
    database.prepare("PRAGMA table_info(decision_requests)").all().map((column) => column.name),
  );
  if (!requestColumns.has("why_hadi")) {
    database.exec("ALTER TABLE decision_requests ADD COLUMN why_hadi TEXT NOT NULL DEFAULT ''");
  }
  if (!requestColumns.has("recommendation")) {
    database.exec("ALTER TABLE decision_requests ADD COLUMN recommendation TEXT NOT NULL DEFAULT ''");
  }

  const upsertSeed = database.prepare(`
    INSERT INTO decision_requests (
      id, area, priority, prompt, context, why_hadi, recommendation, response_type, choices_json,
      artifact_revision, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      area = excluded.area,
      priority = excluded.priority,
      prompt = excluded.prompt,
      context = excluded.context,
      why_hadi = excluded.why_hadi,
      recommendation = excluded.recommendation,
      response_type = excluded.response_type,
      choices_json = excluded.choices_json,
      artifact_revision = CASE
        WHEN decision_requests.status = 'open' THEN excluded.artifact_revision
        ELSE decision_requests.artifact_revision
      END,
      status = CASE
        WHEN decision_requests.status IN ('open', 'deferred') THEN excluded.status
        ELSE decision_requests.status
      END,
      updated_at = excluded.updated_at
  `);

  if (seedPath) {
    try {
      const seed = JSON.parse(readFileSync(seedPath, "utf8"));
      const seedIds = [];
      for (const question of seed.questions ?? []) {
        seedIds.push(question.id);
        upsertSeed.run(
          question.id,
          question.area,
          question.priority,
          question.prompt,
          question.context,
          question.why_hadi ?? "",
          question.recommendation ?? "",
          question.response_type,
          JSON_TEXT(question.choices ?? []),
          question.artifact_revision,
          question.status ?? "open",
          question.created_at,
          seed.updated_at ?? question.created_at,
        );
      }
      if (seedIds.length) {
        const placeholders = seedIds.map(() => "?").join(", ");
        database.prepare(`
          UPDATE decision_requests
          SET status = 'deferred', updated_at = ?
          WHERE status = 'open' AND id NOT IN (${placeholders})
        `).run(seed.updated_at ?? new Date().toISOString(), ...seedIds);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const listRequests = () => {
    const requests = database.prepare(`
      SELECT * FROM decision_requests
      ORDER BY
        CASE status
          WHEN 'answered' THEN 0
          WHEN 'open' THEN 1
          WHEN 'deferred' THEN 2
          WHEN 'acknowledged' THEN 3
          ELSE 4
        END,
        priority ASC,
        created_at ASC
    `).all();
    const responses = database.prepare(`
      SELECT * FROM decision_responses
      ORDER BY created_at ASC
    `).all();
    const byRequest = new Map();
    for (const response of responses) {
      const list = byRequest.get(response.request_id) ?? [];
      list.push({
        id: response.id,
        choice_id: response.choice_id,
        note: response.note,
        artifact_revision: response.artifact_revision,
        by: response.operator,
        at: response.created_at,
      });
      byRequest.set(response.request_id, list);
    }
    return requests.map((request) => ({
      id: request.id,
      area: request.area,
      priority: request.priority,
      prompt: request.prompt,
      context: request.context,
      why_hadi: request.why_hadi,
      recommendation: request.recommendation,
      response_type: request.response_type,
      choices: PARSE_JSON(request.choices_json, []),
      artifact_revision: request.artifact_revision,
      status: request.status,
      created_at: request.created_at,
      updated_at: request.updated_at,
      answers: byRequest.get(request.id) ?? [],
    }));
  };

  const answerRequest = ({
    requestId,
    idempotencyKey,
    choiceId = null,
    note = "",
    artifactRevision,
    operator = "Local studio operator (identity unverified)",
  }) => {
    if (!idempotencyKey) return {ok: false, status: 400, error: "idempotency key required"};
    const existing = database.prepare(
      "SELECT * FROM decision_responses WHERE idempotency_key = ?",
    ).get(idempotencyKey);
    if (existing) return {ok: true, status: 200, duplicate: true, response_id: existing.id};

    const request = database.prepare(
      "SELECT * FROM decision_requests WHERE id = ?",
    ).get(requestId);
    if (!request) return {ok: false, status: 404, error: "question not found"};
    if (request.status !== "open") return {ok: false, status: 409, error: `question is ${request.status}`};
    if (artifactRevision !== request.artifact_revision) {
      return {ok: false, status: 409, error: "question artifact revision changed; reload before answering"};
    }

    const cleanNote = String(note ?? "").trim().slice(0, 4000);
    const choices = PARSE_JSON(request.choices_json, []);
    if (choiceId && !choices.some((choice) => choice.id === choiceId)) {
      return {ok: false, status: 400, error: "valid choice required"};
    }
    if (!choiceId && !cleanNote) {
      return {ok: false, status: 400, error: "choose an option or provide your own answer"};
    }
    const now = new Date().toISOString();
    const responseId = `answer-${randomUUID()}`;
    const wakeId = `wake-${randomUUID()}`;

    database.exec("BEGIN IMMEDIATE");
    try {
      const changed = database.prepare(`
        UPDATE decision_requests
        SET status = 'answered', updated_at = ?
        WHERE id = ? AND status = 'open' AND artifact_revision = ?
      `).run(now, requestId, artifactRevision);
      if (changed.changes !== 1) throw new Error("question changed while answer was being recorded");
      database.prepare(`
        INSERT INTO decision_responses (
          id, request_id, idempotency_key, choice_id, note,
          artifact_revision, operator, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        responseId,
        requestId,
        idempotencyKey,
        choiceId,
        cleanNote,
        artifactRevision,
        operator,
        now,
      );
      database.prepare(`
        INSERT INTO wake_outbox (id, topic, record_id, created_at)
        VALUES (?, 'decision-response', ?, ?)
      `).run(wakeId, responseId, now);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      return {ok: false, status: 409, error: error.message};
    }
    return {ok: true, status: 201, response_id: responseId, wake_id: wakeId};
  };

  const pendingWakeEvents = () => database.prepare(`
    SELECT id, topic, record_id, created_at
    FROM wake_outbox
    WHERE claimed_at IS NULL AND completed_at IS NULL
    ORDER BY created_at ASC
  `).all();

  const claimWakeEvents = ({claimer, limit = 10, leaseMs = 5 * 60 * 1000}) => {
    if (!claimer) throw new Error("wake claimer required");
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const now = new Date();
    const staleBefore = new Date(now.getTime() - leaseMs).toISOString();
    const claimedAt = now.toISOString();

    database.exec("BEGIN IMMEDIATE");
    try {
      const rows = database.prepare(`
        SELECT id, topic, record_id, created_at
        FROM wake_outbox
        WHERE completed_at IS NULL
          AND (claimed_at IS NULL OR claimed_at < ?)
        ORDER BY created_at ASC
        LIMIT ?
      `).all(staleBefore, safeLimit);
      const claim = database.prepare(`
        UPDATE wake_outbox
        SET claimed_at = ?, claimed_by = ?
        WHERE id = ? AND completed_at IS NULL
      `);
      for (const row of rows) claim.run(claimedAt, claimer, row.id);
      database.exec("COMMIT");
      return rows;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };

  const completeWakeEvents = ({eventIds, claimer}) => {
    if (!Array.isArray(eventIds) || !eventIds.length) return 0;
    const complete = database.prepare(`
      UPDATE wake_outbox
      SET completed_at = ?
      WHERE id = ? AND claimed_by = ? AND completed_at IS NULL
    `);
    const now = new Date().toISOString();
    let changes = 0;
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const eventId of eventIds) changes += complete.run(now, eventId, claimer).changes;
      database.exec("COMMIT");
      return changes;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };

  const releaseWakeEvents = ({eventIds, claimer}) => {
    if (!Array.isArray(eventIds) || !eventIds.length) return 0;
    const release = database.prepare(`
      UPDATE wake_outbox
      SET claimed_at = NULL, claimed_by = NULL
      WHERE id = ? AND claimed_by = ? AND completed_at IS NULL
    `);
    let changes = 0;
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const eventId of eventIds) changes += release.run(eventId, claimer).changes;
      database.exec("COMMIT");
      return changes;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };

  return {
    answerRequest,
    claimWakeEvents,
    close: () => database.close(),
    completeWakeEvents,
    listRequests,
    pendingWakeEvents,
    releaseWakeEvents,
  };
}

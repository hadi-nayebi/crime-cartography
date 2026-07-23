import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import test from "node:test";

import {createDecisionStore} from "./decision-store.mjs";

const TEST_ROOT = join(process.cwd(), ".codex", "runtime", "tests");
mkdirSync(TEST_ROOT, {recursive: true});

test("records one immutable answer and one wake event", () => {
  const directory = mkdtempSync(join(TEST_ROOT, "decision-store-"));
  const seedPath = join(directory, "questions.json");
  writeFileSync(seedPath, JSON.stringify({
    questions: [{
      id: "q-test",
      area: "test",
      priority: "normal",
      prompt: "Choose",
      context: "Test context",
      response_type: "choice-with-note",
      choices: [{id: "a", label: "A"}],
      artifact_revision: "rev-1",
      status: "open",
      created_at: "2026-07-23T00:00:00.000Z",
    }],
    updated_at: "2026-07-23T00:00:00.000Z",
  }));
  const store = createDecisionStore({
    databasePath: join(directory, "studio.sqlite"),
    seedPath,
  });

  const first = store.answerRequest({
    requestId: "q-test",
    idempotencyKey: "same-request",
    choiceId: "a",
    note: "Because.",
    artifactRevision: "rev-1",
  });
  assert.equal(first.status, 201);
  assert.equal(store.listRequests()[0].status, "answered");
  assert.equal(store.listRequests()[0].answers.length, 1);
  assert.equal(store.pendingWakeEvents().length, 1);

  const duplicate = store.answerRequest({
    requestId: "q-test",
    idempotencyKey: "same-request",
    choiceId: "a",
    note: "Ignored duplicate.",
    artifactRevision: "rev-1",
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(store.listRequests()[0].answers.length, 1);
  assert.equal(store.pendingWakeEvents().length, 1);

  const claimed = store.claimWakeEvents({claimer: "test-bridge"});
  assert.equal(claimed.length, 1);
  assert.equal(store.pendingWakeEvents().length, 0);
  assert.equal(store.completeWakeEvents({eventIds: [claimed[0].id], claimer: "wrong-bridge"}), 0);
  assert.equal(store.completeWakeEvents({eventIds: [claimed[0].id], claimer: "test-bridge"}), 1);
  store.close();
});

test("accepts an unrestricted typed answer when suggested choices do not fit", () => {
  const directory = mkdtempSync(join(TEST_ROOT, "decision-store-"));
  const seedPath = join(directory, "questions.json");
  writeFileSync(seedPath, JSON.stringify({
    questions: [{
      id: "q-custom",
      area: "test",
      priority: "normal",
      prompt: "Choose or explain",
      context: "Test context",
      why_hadi: "Owner judgment",
      recommendation: "Option A",
      response_type: "choice-with-note",
      choices: [{id: "a", label: "A"}],
      artifact_revision: "rev-1",
      status: "open",
      created_at: "2026-07-23T00:00:00.000Z",
    }],
    updated_at: "2026-07-23T00:00:00.000Z",
  }));
  const store = createDecisionStore({
    databasePath: join(directory, "studio.sqlite"),
    seedPath,
  });

  const result = store.answerRequest({
    requestId: "q-custom",
    idempotencyKey: "custom-answer",
    note: "Neither option: use a staged hybrid.",
    artifactRevision: "rev-1",
  });
  assert.equal(result.status, 201);
  const request = store.listRequests()[0];
  assert.equal(request.answers[0].choice_id, null);
  assert.equal(request.answers[0].note, "Neither option: use a staged hybrid.");
  assert.equal(request.why_hadi, "Owner judgment");
  assert.equal(request.recommendation, "Option A");
  store.close();
});

test("rejects an answer bound to a stale artifact revision", () => {
  const directory = mkdtempSync(join(TEST_ROOT, "decision-store-"));
  const seedPath = join(directory, "questions.json");
  writeFileSync(seedPath, JSON.stringify({
    questions: [{
      id: "q-test",
      area: "test",
      priority: "normal",
      prompt: "Choose",
      context: "Test context",
      response_type: "choice",
      choices: [{id: "a", label: "A"}],
      artifact_revision: "rev-2",
      status: "open",
      created_at: "2026-07-23T00:00:00.000Z",
    }],
    updated_at: "2026-07-23T00:00:00.000Z",
  }));
  const store = createDecisionStore({
    databasePath: join(directory, "studio.sqlite"),
    seedPath,
  });
  const result = store.answerRequest({
    requestId: "q-test",
    idempotencyKey: "stale",
    choiceId: "a",
    artifactRevision: "rev-1",
  });
  assert.equal(result.status, 409);
  assert.match(result.error, /revision changed/);
  assert.equal(store.pendingWakeEvents().length, 0);
  store.close();
});

test("defers a removed seed question instead of leaving a duplicate control plane", () => {
  const directory = mkdtempSync(join(TEST_ROOT, "decision-store-"));
  const seedPath = join(directory, "questions.json");
  const question = (id) => ({
    id,
    area: "test",
    priority: "normal",
    prompt: id,
    context: "Test context",
    response_type: "text",
    choices: [],
    artifact_revision: "rev-1",
    status: "open",
    created_at: "2026-07-23T00:00:00.000Z",
  });
  writeFileSync(seedPath, JSON.stringify({
    questions: [question("q-current"), question("q-moved")],
    updated_at: "2026-07-23T00:00:00.000Z",
  }));
  createDecisionStore({databasePath: join(directory, "studio.sqlite"), seedPath}).close();

  writeFileSync(seedPath, JSON.stringify({
    questions: [question("q-current")],
    updated_at: "2026-07-23T01:00:00.000Z",
  }));
  const store = createDecisionStore({databasePath: join(directory, "studio.sqlite"), seedPath});
  const moved = store.listRequests().find((request) => request.id === "q-moved");
  assert.equal(moved.status, "deferred");
  store.close();
});

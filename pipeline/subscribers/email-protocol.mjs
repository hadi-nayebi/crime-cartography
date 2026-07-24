const MARKER = "CRIME_CARTOGRAPHY_SUBSCRIPTION_V1:";
const PROJECT_ID = "crime-cartography";
const SCHEMA_VERSION = "1.0.0";
const MAX_NAME_LENGTH = 80;
const MAX_INTERESTS = 3;
const MAX_INTEREST_LENGTH = 80;

function requiredString(value, field, maxLength = 256) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (normalized.length > maxLength) throw new Error(`${field} is too long`);
  return normalized;
}

function normalizeEmail(value) {
  const email = requiredString(value, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("email is invalid");
  }
  return email;
}

function normalizeTimestamp(value) {
  const timestamp = requiredString(value, "requested_at", 40);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error("requested_at is invalid");
  }
  return new Date(timestamp).toISOString();
}

function normalizeInterests(value) {
  if (!Array.isArray(value)) throw new Error("interests must be an array");
  if (value.length > MAX_INTERESTS) throw new Error("too many interests");
  return [...new Set(value.map((interest) => (
    requiredString(interest, "interest", MAX_INTEREST_LENGTH)
  )))];
}

export function validateSubscriptionRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("subscription envelope must be an object");
  }
  if (value.schema_version !== SCHEMA_VERSION) {
    throw new Error("unsupported subscription schema");
  }
  if (value.action !== "subscribe") throw new Error("unsupported subscription action");
  if (value.project_id !== PROJECT_ID) throw new Error("wrong project_id");

  const name = value.name == null || String(value.name).trim() === ""
    ? null
    : requiredString(value.name, "name", MAX_NAME_LENGTH);

  return {
    schema_version: SCHEMA_VERSION,
    action: "subscribe",
    project_id: PROJECT_ID,
    name,
    email: normalizeEmail(value.email),
    interests: normalizeInterests(value.interests ?? []),
    consent_version: requiredString(value.consent_version, "consent_version", 120),
    requested_at: normalizeTimestamp(value.requested_at),
  };
}

export function encodeSubscriptionRequest(value) {
  const request = validateSubscriptionRequest({
    schema_version: SCHEMA_VERSION,
    action: "subscribe",
    project_id: PROJECT_ID,
    ...value,
  });
  const encoded = Buffer.from(JSON.stringify(request), "utf8").toString("base64url");
  return `${MARKER}${encoded}`;
}

export function parseSubscriptionRequest(text) {
  const source = String(text ?? "");
  const markerIndex = source.indexOf(MARKER);
  if (markerIndex < 0) throw new Error("subscription marker not found");
  const encoded = source
    .slice(markerIndex + MARKER.length)
    .match(/^[A-Za-z0-9_-]+/)?.[0];
  if (!encoded) throw new Error("subscription payload not found");

  let value;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("subscription payload is malformed");
  }
  return validateSubscriptionRequest(value);
}

export const subscriptionProtocol = Object.freeze({
  marker: MARKER,
  projectId: PROJECT_ID,
  schemaVersion: SCHEMA_VERSION,
});

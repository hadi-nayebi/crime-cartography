import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeSubscriptionRequest,
  parseSubscriptionRequest,
  subscriptionProtocol,
} from "./email-protocol.mjs";

const request = {
  name: "Ada Reviewer",
  email: "ADA@example.com",
  interests: ["data-and-maps", "evidence-and-sourcing"],
  consent_version: "crime-cartography-public-design-v0.9",
  requested_at: "2026-07-23T19:00:00.000Z",
};

test("round trips a website subscription envelope", () => {
  const line = encodeSubscriptionRequest(request);
  assert.match(line, /^CRIME_CARTOGRAPHY_SUBSCRIPTION_V1:/);
  assert.deepEqual(parseSubscriptionRequest(`Website request\n${line}\nEnd`), {
    schema_version: "1.0.0",
    action: "subscribe",
    project_id: "crime-cartography",
    name: "Ada Reviewer",
    email: "ada@example.com",
    interests: ["data-and-maps", "evidence-and-sourcing"],
    consent_version: "crime-cartography-public-design-v0.9",
    requested_at: "2026-07-23T19:00:00.000Z",
  });
});

test("rejects a modified project or action", () => {
  const line = encodeSubscriptionRequest(request);
  const decoded = JSON.parse(
    Buffer.from(line.slice(subscriptionProtocol.marker.length), "base64url").toString("utf8"),
  );

  for (const patch of [
    {project_id: "another-project"},
    {action: "award-points"},
  ]) {
    const tampered = `${subscriptionProtocol.marker}${
      Buffer.from(JSON.stringify({...decoded, ...patch})).toString("base64url")
    }`;
    assert.throws(() => parseSubscriptionRequest(tampered), /wrong project_id|unsupported subscription action/);
  }
});

test("rejects malformed or incomplete input", () => {
  assert.throws(() => parseSubscriptionRequest("nothing here"), /marker not found/);
  assert.throws(
    () => encodeSubscriptionRequest({...request, email: "not-an-email"}),
    /email is invalid/,
  );
  assert.throws(
    () => encodeSubscriptionRequest({...request, consent_version: ""}),
    /consent_version is required/,
  );
  assert.throws(
    () => encodeSubscriptionRequest({...request, name: "x".repeat(81)}),
    /name is too long/,
  );
  assert.throws(
    () => encodeSubscriptionRequest({
      ...request,
      interests: ["one", "two", "three", "four"],
    }),
    /too many interests/,
  );
});

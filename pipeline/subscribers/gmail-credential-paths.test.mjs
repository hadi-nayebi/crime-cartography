import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertPrivateCredential,
  gmailCredentialPaths,
} from "./gmail-credential-paths.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;

test("uses explicit VPS credential paths when provided", () => {
  assert.deepEqual(gmailCredentialPaths({
    root: "/srv/crime-cartography",
    environment: {
      CRIME_CARTOGRAPHY_GMAIL_CLIENT_SECRET: "/etc/crime-cartography/gmail-oauth-client.json",
      CRIME_CARTOGRAPHY_GMAIL_TOKEN: "/var/lib/crime-cartography/gmail-readonly-token.json",
    },
  }), {
    clientSecretPath: "/etc/crime-cartography/gmail-oauth-client.json",
    tokenPath: "/var/lib/crime-cartography/gmail-readonly-token.json",
  });
});

test("defaults to repository-local ignored credentials for local development", () => {
  assert.deepEqual(gmailCredentialPaths({root: "/workspace/maps", environment: {}}), {
    clientSecretPath: "/workspace/maps/.secrets/youtube_client_secret.json",
    tokenPath: "/workspace/maps/.secrets/gmail_subscriber_inbox_token.json",
  });
});

test("rejects credentials exposed to group or other users", async () => {
  const directory = await mkdtemp(join(ROOT, ".codex/runtime/gmail-path-test-"));
  const path = join(directory, "credential.json");
  await writeFile(path, "{}", {mode: 0o600});
  await assert.doesNotReject(assertPrivateCredential(path, "test credential"));
  if (process.platform !== "win32") {
    await chmod(path, 0o644);
    await assert.rejects(assertPrivateCredential(path, "test credential"), /must not be readable/);
  }
});

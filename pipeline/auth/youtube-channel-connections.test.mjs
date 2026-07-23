import assert from "node:assert/strict";
import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createYoutubeChannelConnections } from "./youtube-channel-connections.mjs";

const root = join(process.cwd(), ".codex/runtime/tests/youtube-channel-connections");
const channel = (suffix, title) => ({
  id: `UC${suffix.padEnd(22, "x").slice(0, 22)}`,
  title,
  handle: `@${title.replaceAll(" ", "")}`,
});
const token = (name) => ({ refresh_token: `refresh-${name}`, scope: "youtube youtube.upload" });

test.beforeEach(async () => {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
});

test.after(async () => {
  await rm(root, { recursive: true, force: true });
});

test("stores separate tokens and switches the active channel explicitly", async () => {
  const store = createYoutubeChannelConnections({ secretsDirectory: root });
  const earth = channel("earth", "Earth One");
  const crime = channel("crime", "Crime Cartography");
  await store.saveConnection({ channel: earth, token: token("earth") });
  await store.saveConnection({ channel: crime, token: token("crime") });

  assert.equal((await store.active()).connection.channel_id, crime.id);
  await store.activate(earth.id);
  assert.equal((await store.active()).token.refresh_token, "refresh-earth");
  assert.deepEqual((await store.listConnections()).map((item) => item.title), [
    "Crime Cartography",
    "Earth One",
  ]);
});

test("requires explicit destination lock and never infers it from the active token", async () => {
  const store = createYoutubeChannelConnections({ secretsDirectory: root });
  const crime = channel("crime", "Crime Cartography");
  await store.saveConnection({ channel: crime, token: token("crime") });
  assert.equal(await store.destination(), null);
  const destination = await store.lockDestination(crime.id);
  assert.equal(destination.channel_id, crime.id);
});

test("rejects a callback without a channel-specific refresh token", async () => {
  const store = createYoutubeChannelConnections({ secretsDirectory: root });
  await assert.rejects(
    store.saveConnection({ channel: channel("crime", "Crime Cartography"), token: { access_token: "short-lived" } }),
    /own refresh token/,
  );
});

test("OAuth state is one-time and expires", async () => {
  const store = createYoutubeChannelConnections({ secretsDirectory: root });
  const state = await store.createState();
  await store.consumeState(state);
  await assert.rejects(store.consumeState(state), /state mismatch/);

  const expired = await store.createState();
  await assert.rejects(store.consumeState(expired, Date.now() + 11 * 60 * 1000), /expired/);
});

test("removes only the selected channel token and clears an active connection", async () => {
  const store = createYoutubeChannelConnections({ secretsDirectory: root });
  const earth = channel("earth", "Earth One");
  const crime = channel("crime", "Crime Cartography");
  await store.saveConnection({ channel: earth, token: token("earth") });
  await store.saveConnection({ channel: crime, token: token("crime") });
  await store.activate(earth.id);

  const removed = await store.removeConnection(earth.id);
  assert.equal(removed.channel_id, earth.id);
  assert.equal(await store.active(), null);
  assert.deepEqual((await store.listConnections()).map((item) => item.channel_id), [crime.id]);
  await assert.rejects(access(join(root, "youtube_tokens", `${earth.id}.json`)));
  await access(join(root, "youtube_tokens", `${crime.id}.json`));
});

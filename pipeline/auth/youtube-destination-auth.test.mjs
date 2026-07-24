import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createYoutubeChannelConnections } from "./youtube-channel-connections.mjs";
import { createYoutubeDestinationAuth } from "./youtube-destination-auth.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const CRIME = "UCcrimecartography000000";
const EARTH = "UCearthone00000000000000";

async function fixture() {
  const directory = await mkdtemp(join(ROOT, ".codex/runtime/youtube-auth-test-"));
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "youtube_client_secret.json"),
    JSON.stringify({ installed: { client_id: "client", client_secret: "secret" } }),
  );
  return directory;
}

function fakeFetch(resolvedChannelId = CRIME) {
  return async (url) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "access" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      items: [{ id: resolvedChannelId, snippet: { title: "Crime Cartography", customUrl: "@CrimeCartography" } }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

test("authorizes only when active, resolved, and locked channel identities match", async () => {
  const secretsDirectory = await fixture();
  const store = createYoutubeChannelConnections({ secretsDirectory });
  await store.saveConnection({
    channel: { id: CRIME, title: "Crime Cartography" },
    token: { refresh_token: "crime-refresh" },
  });
  await store.lockDestination(CRIME);
  const auth = createYoutubeDestinationAuth({ secretsDirectory, fetchImpl: fakeFetch() });
  const result = await auth.authorizeMutation();
  assert.equal(result.channel.id, CRIME);
  assert.equal(result.destination.channel_id, CRIME);
});

test("rejects an active connection that differs from the locked destination", async () => {
  const secretsDirectory = await fixture();
  const store = createYoutubeChannelConnections({ secretsDirectory });
  await store.saveConnection({
    channel: { id: CRIME, title: "Crime Cartography" },
    token: { refresh_token: "crime-refresh" },
  });
  await store.lockDestination(CRIME);
  await store.saveConnection({
    channel: { id: EARTH, title: "Earth One" },
    token: { refresh_token: "earth-refresh" },
  });
  const auth = createYoutubeDestinationAuth({ secretsDirectory, fetchImpl: fakeFetch(EARTH) });
  await assert.rejects(auth.authorizeMutation(), /does not match locked destination/);
});

test("rejects a token that resolves to a different channel", async () => {
  const secretsDirectory = await fixture();
  const store = createYoutubeChannelConnections({ secretsDirectory });
  await store.saveConnection({
    channel: { id: CRIME, title: "Crime Cartography" },
    token: { refresh_token: "crime-refresh" },
  });
  await store.lockDestination(CRIME);
  const auth = createYoutubeDestinationAuth({ secretsDirectory, fetchImpl: fakeFetch(EARTH) });
  await assert.rejects(auth.authorizeMutation(), /resolved YouTube identity/);
});

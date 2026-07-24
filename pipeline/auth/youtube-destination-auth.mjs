import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createYoutubeChannelConnections } from "./youtube-channel-connections.mjs";

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function oauthConfig(value) {
  const config = value?.installed ?? value?.web;
  return config?.client_id && config?.client_secret ? config : null;
}

export function createYoutubeDestinationAuth({
  secretsDirectory,
  clientSecretPath = join(secretsDirectory, "youtube_client_secret.json"),
  expectedChannelId = process.env.CRIME_CARTOGRAPHY_CHANNEL_ID || null,
  fetchImpl = fetch,
}) {
  const connections = createYoutubeChannelConnections({ secretsDirectory });

  async function refreshAccessToken(token) {
    const config = oauthConfig(await readJson(clientSecretPath));
    if (!config) throw new Error("YouTube OAuth client secret is missing or invalid");
    if (!token?.refresh_token) throw new Error("the active YouTube connection has no refresh token");
    const response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.client_id,
        client_secret: config.client_secret,
        refresh_token: token.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.access_token) {
      throw new Error(`could not refresh the channel-scoped YouTube token (HTTP ${response.status})`);
    }
    return result.access_token;
  }

  async function resolveChannel(accessToken) {
    const response = await fetchImpl(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const result = await response.json();
    const channel = result.items?.[0];
    if (!response.ok || !CHANNEL_ID.test(channel?.id ?? "")) {
      throw new Error("the active YouTube token did not resolve to one valid channel");
    }
    return {
      id: channel.id,
      title: channel.snippet?.title ?? channel.id,
      handle: channel.snippet?.customUrl ?? null,
    };
  }

  async function authorizeMutation() {
    const locked = expectedChannelId
      ? { channel_id: expectedChannelId, source: "environment" }
      : await connections.destination();
    if (!CHANNEL_ID.test(locked?.channel_id ?? "")) {
      throw new Error("Crime Cartography upload destination is not explicitly locked");
    }

    const active = await connections.active();
    if (!active?.connection?.channel_id || !active?.token) {
      throw new Error("no channel-scoped YouTube connection is active");
    }
    if (active.connection.channel_id !== locked.channel_id) {
      throw new Error(
        `active YouTube connection ${active.connection.channel_id} does not match locked destination ${locked.channel_id}`,
      );
    }

    const accessToken = await refreshAccessToken(active.token);
    const channel = await resolveChannel(accessToken);
    if (channel.id !== active.connection.channel_id || channel.id !== locked.channel_id) {
      throw new Error(
        `resolved YouTube identity ${channel.id} does not match the active and locked Crime Cartography destination`,
      );
    }
    return {
      accessToken,
      channel,
      destination: locked,
      connection: active.connection,
    };
  }

  return {
    authorizeMutation,
    refreshAccessToken,
    resolveChannel,
  };
}

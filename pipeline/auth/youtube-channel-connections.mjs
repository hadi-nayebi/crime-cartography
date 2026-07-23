import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const STATE_TTL_MS = 10 * 60 * 1000;

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}

function assertChannel(channel) {
  if (!CHANNEL_ID.test(channel?.id ?? "")) throw new Error("invalid YouTube channel id");
  if (!String(channel?.title ?? "").trim()) throw new Error("YouTube channel title is required");
}

function emptyRegistry() {
  return {
    schema_version: "1.0.0",
    active_channel_id: null,
    connections: {},
  };
}

export function createYoutubeChannelConnections({ secretsDirectory }) {
  const registryPath = join(secretsDirectory, "youtube_connections.json");
  const tokenDirectory = join(secretsDirectory, "youtube_tokens");
  const statePath = join(secretsDirectory, "youtube_oauth_state.json");
  const destinationPath = join(secretsDirectory, "youtube_destination.json");

  async function registry() {
    const value = await readJson(registryPath, emptyRegistry());
    return {
      ...emptyRegistry(),
      ...value,
      connections: value?.connections && typeof value.connections === "object"
        ? value.connections
        : {},
    };
  }

  async function saveConnection({ channel, token, source = "oauth", connectedAt = new Date().toISOString() }) {
    assertChannel(channel);
    if (!token?.refresh_token) {
      throw new Error("channel connection requires its own refresh token; refusing to reuse another channel token");
    }
    await mkdir(tokenDirectory, { recursive: true, mode: 0o700 });
    const tokenFile = `${channel.id}.json`;
    await atomicWriteJson(join(tokenDirectory, tokenFile), token);
    const value = await registry();
    value.connections[channel.id] = {
      channel_id: channel.id,
      title: String(channel.title),
      handle: channel.handle ?? null,
      thumb: channel.thumb ?? null,
      token_file: tokenFile,
      connected_at: connectedAt,
      source,
      scopes: String(token.scope ?? "").split(/\s+/).filter(Boolean),
    };
    value.active_channel_id = channel.id;
    await atomicWriteJson(registryPath, value);
    return value.connections[channel.id];
  }

  async function listConnections() {
    const value = await registry();
    return Object.values(value.connections)
      .map(({ token_file: _tokenFile, ...connection }) => ({
        ...connection,
        active: connection.channel_id === value.active_channel_id,
      }))
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }

  async function tokenFor(channelId) {
    if (!CHANNEL_ID.test(channelId ?? "")) return null;
    const value = await registry();
    const connection = value.connections[channelId];
    if (!connection?.token_file) return null;
    const token = await readJson(join(tokenDirectory, connection.token_file));
    return token?.refresh_token ? token : null;
  }

  async function active() {
    const value = await registry();
    const channelId = value.active_channel_id;
    if (!channelId || !value.connections[channelId]) return null;
    const token = await tokenFor(channelId);
    return token ? { connection: value.connections[channelId], token } : null;
  }

  async function activate(channelId) {
    if (!CHANNEL_ID.test(channelId ?? "")) throw new Error("invalid YouTube channel id");
    const value = await registry();
    if (!value.connections[channelId]) throw new Error("channel is not connected");
    if (!(await tokenFor(channelId))) throw new Error("channel token is missing");
    value.active_channel_id = channelId;
    await atomicWriteJson(registryPath, value);
    return value.connections[channelId];
  }

  async function removeConnection(channelId) {
    if (!CHANNEL_ID.test(channelId ?? "")) throw new Error("invalid YouTube channel id");
    const value = await registry();
    const connection = value.connections[channelId];
    if (!connection) return null;
    const expectedTokenFile = `${channelId}.json`;
    if (connection.token_file !== expectedTokenFile) {
      throw new Error("refusing to remove a connection with an unexpected token path");
    }
    await rm(join(tokenDirectory, expectedTokenFile), { force: true });
    delete value.connections[channelId];
    if (value.active_channel_id === channelId) value.active_channel_id = null;
    await atomicWriteJson(registryPath, value);
    const { token_file: _tokenFile, ...publicConnection } = connection;
    return publicConnection;
  }

  async function createState({ purpose = "connect-channel" } = {}) {
    const state = randomUUID();
    await atomicWriteJson(statePath, {
      state,
      purpose,
      created_at: new Date().toISOString(),
    });
    return state;
  }

  async function consumeState(state, now = Date.now()) {
    const record = await readJson(statePath);
    await rm(statePath, { force: true });
    if (!state || !record?.state || state !== record.state) {
      throw new Error("OAuth state mismatch; start the channel connection again");
    }
    const created = new Date(record.created_at).getTime();
    if (!Number.isFinite(created) || now - created > STATE_TTL_MS) {
      throw new Error("OAuth state expired; start the channel connection again");
    }
    return record;
  }

  async function destination() {
    const value = await readJson(destinationPath);
    return CHANNEL_ID.test(value?.channel_id ?? "") ? value : null;
  }

  async function lockDestination(channelId) {
    if (!CHANNEL_ID.test(channelId ?? "")) throw new Error("invalid YouTube channel id");
    const value = await registry();
    const connection = value.connections[channelId];
    if (!connection) throw new Error("connect the channel before locking it as the destination");
    const record = {
      schema_version: "1.0.0",
      channel_id: channelId,
      title: connection.title,
      handle: connection.handle ?? null,
      locked_at: new Date().toISOString(),
    };
    await atomicWriteJson(destinationPath, record);
    return record;
  }

  return {
    activate,
    active,
    consumeState,
    createState,
    destination,
    listConnections,
    lockDestination,
    removeConnection,
    saveConnection,
    tokenFor,
  };
}

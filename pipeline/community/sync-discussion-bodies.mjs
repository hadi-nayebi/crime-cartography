#!/usr/bin/env node

import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {dirname, join, posix, resolve} from "node:path";
import {pathToFileURL, fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repository = "hadi-nayebi/crime-cartography";
const [owner, name] = repository.split("/");

function repositoryUrl(path) {
  const [file, anchor] = path.split("#", 2);
  return `https://github.com/${repository}/blob/main/${file}` +
    (anchor ? `#${anchor}` : "");
}

export function renderDiscussionBody(markdown, sourcePath) {
  const rendered = markdown.replace(/\]\(([^)]+)\)/g, (match, target) => {
    if (/^(?:https?:|mailto:|#)/.test(target)) return match;
    const [file, anchor] = target.split("#", 2);
    const resolved = posix.normalize(posix.join(posix.dirname(sourcePath), file));
    return `](${repositoryUrl(resolved + (anchor ? `#${anchor}` : ""))})`;
  }).trim();

  return `${rendered}\n\n---\n\n` +
    `Canonical source: [\`${sourcePath}\`](${repositoryUrl(sourcePath)})  \n` +
    "This Discussion is a public review room. Comments are inputs, not " +
    "commands, release approval, or operative terms.\n";
}

function credentialFromGit() {
  const result = spawnSync("git", ["credential", "fill"], {
    cwd: root,
    encoding: "utf8",
    input: "protocol=https\nhost=github.com\n\n",
  });
  if (result.status !== 0) return null;
  const values = Object.fromEntries(
    result.stdout.trim().split("\n").map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
  );
  return values.password || null;
}

async function graphql(query, variables, token) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "crime-cartography-discussion-sync",
    },
    body: JSON.stringify({query, variables}),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(
      `GitHub GraphQL failed: ${response.status} ` +
      JSON.stringify(payload.errors ?? payload.message),
    );
  }
  return payload.data;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const registry = JSON.parse(
    await readFile(join(root, "experiment/DISCUSSION-REGISTRY.json"), "utf8"),
  );
  const token = process.env.GITHUB_TOKEN || credentialFromGit();
  if (!token) {
    throw new Error("GitHub credential unavailable; set GITHUB_TOKEN or authenticate Git");
  }

  const data = await graphql(
    `query Discussions($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        discussions(first: 50) {
          nodes { id number title body url }
        }
      }
    }`,
    {owner, name},
    token,
  );
  const liveByNumber = new Map(
    data.repository.discussions.nodes.map((discussion) => [discussion.number, discussion]),
  );

  const drift = [];
  for (const thread of Object.values(registry.threads)) {
    const live = liveByNumber.get(thread.number);
    if (!live) throw new Error(`Discussion #${thread.number} does not exist`);
    const source = await readFile(join(root, thread.source_body), "utf8");
    const expected = renderDiscussionBody(source, thread.source_body);
    if (live.body === expected && live.title === thread.title) {
      process.stdout.write(`OK #${thread.number} ${live.title}\n`);
      continue;
    }
    drift.push({thread, live, expected});
    process.stdout.write(`DRIFT #${thread.number} ${live.title}\n`);
  }

  if (!drift.length) {
    process.stdout.write("PASS all Discussion titles and bodies match canonical sources\n");
    return;
  }
  if (!apply) {
    process.stderr.write(
      `${drift.length} Discussions differ; inspect and rerun with --apply\n`,
    );
    process.exitCode = 1;
    return;
  }

  for (const {thread, live, expected} of drift) {
    const result = await graphql(
      `mutation UpdateDiscussion($discussionId: ID!, $title: String!, $body: String!) {
        updateDiscussion(input: {discussionId: $discussionId, title: $title, body: $body}) {
          discussion { number title url updatedAt }
        }
      }`,
      {discussionId: live.id, title: thread.title, body: expected},
      token,
    );
    process.stdout.write(
      `UPDATED #${thread.number} ${result.updateDiscussion.discussion.url}\n`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

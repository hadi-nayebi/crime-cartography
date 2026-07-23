#!/usr/bin/env node

import {execFile} from "node:child_process";
import {mkdir, rename, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

const exec = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outputPath = join(root, "public/project-status.json");
const {stdout} = await exec(process.execPath, [join(root, "pipeline/status.mjs"), "--json"], {
  cwd: root,
  maxBuffer: 8 * 1024 * 1024,
});
const status = JSON.parse(stdout);

const publicStatus = {
  schema_version: "1.0.0",
  project_id: "crime-cartography",
  name: "Crime Cartography",
  stage: "public-design",
  generated_at: new Date().toISOString(),
  production: {
    videos_total: status.total,
    rendered: status.counts.render,
    awaiting_editorial_review: status.flow.reviewReady.length,
    approved_for_release: status.flow.awaitingPublish.length,
    previously_published_on_earthone: status.rows.filter(
      (row) => row.previouslyPublishedOnEarthOne,
    ).length,
  },
  operating_tracks: {
    release: {
      status: "active",
      mode: "Hadi edits and approves the introduction and first remade test videos",
      waits_for_project_subscribers: false,
      next: "Launch the introduction and website, then release one or two remade tests",
    },
    community_editorial: {
      status: "preparing",
      before_activation: "Collect feedback and use it to improve the harness and workflow",
      activation: "500 project subscribers plus enough relevant community feedback to operate responsibly",
    },
  },
  current_milestone: {
    id: "public-design",
    label: "Creator-led launch and public project design",
    status: "active",
    next: "Community editorial beta",
  },
  calls_to_participate: [
    "Critique the proposed project model",
    "Comment on public drafts and remade test videos",
    "Propose sourced historical context for charts",
    "Help design the later editorial email workflow"
  ],
  links: {
    repository: "https://github.com/hadi-nayebi/crime-cartography",
    project_page: "https://hadi-nayebi.github.io/projects/crime-cartography.html"
  }
};

const allowedTopLevel = [
  "schema_version",
  "project_id",
  "name",
  "stage",
  "generated_at",
  "production",
  "operating_tracks",
  "current_milestone",
  "calls_to_participate",
  "links",
];
const actualTopLevel = Object.keys(publicStatus);
if (actualTopLevel.some((key) => !allowedTopLevel.includes(key))) {
  throw new Error("public status contains an unapproved top-level field");
}

await mkdir(dirname(outputPath), {recursive: true});
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(publicStatus, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);
process.stdout.write(`${outputPath}\n`);

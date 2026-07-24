#!/usr/bin/env node

import {execFile} from "node:child_process";
import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
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
const discussions = JSON.parse(
  await readFile(join(root, "experiment/DISCUSSION-REGISTRY.json"), "utf8"),
).threads;

const publicStatus = {
  schema_version: "1.0.0",
  project_id: "crime-cartography",
  name: "Crime Cartography",
  stage: "public-design",
  generated_at: new Date().toISOString(),
  production: {
    cities_mapped: status.total,
    inherited_reference_cuts: status.counts.render,
    reference_cuts_awaiting_remake_review: status.flow.reviewReady.length,
    dedicated_remakes_completed: 0,
    dedicated_remakes_approved: 0,
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
    infrastructure: {
      status: "designing",
      deployment: "One private VPS for the harness and read-only mailbox worker",
      interface: "Static website plus email-first project interaction",
      avoids_by_default: "Hosted subscriber database, public portal, and recurring services until a concrete requirement appears",
      manager_rate_proposal: "$42/hour for verified harness-manager work, with a future published monthly cap",
    },
  },
  current_milestone: {
    id: "public-design",
    label: "Creator-led launch and public project design",
    status: "active",
    next: "Introduction and two human-approved pilot remakes",
    next_event: "Live Q&A plus Project Update #2 after two approved pilots and 30 substantive contributions across at least three expertise lanes",
  },
  roadmap: [
    {
      id: "public-room",
      status: "active",
      label: "Public room and project subscription",
      evidence: "Project context, email request form, and canonical public discussions are available",
      discussion_url: discussions.launch.url,
    },
    {
      id: "intro-pilots",
      status: "next",
      label: "Introduction and first remade releases",
      evidence: "Introduction plus two dedicated-channel remakes receive human approval",
      discussion_url: discussions.launch.url,
    },
    {
      id: "live-qa-update-2",
      status: "proposed-gate",
      label: "Live Q&A and Project Update #2",
      evidence: "Two approved pilots and 30 substantive contributions across at least three expertise lanes",
      discussion_url: discussions.live_qa.url,
    },
    {
      id: "email-editorial-beta",
      status: "gated",
      label: "Capped email editorial cohort",
      evidence: "500 project requests plus tested consent, privacy, scoring, appeals, and release controls",
      discussion_url: discussions.editorial_beta.url,
    },
    {
      id: "content-expansion",
      status: "gated",
      label: "More cities, comparisons, and formats",
      evidence: "Reliable sourcing, remake, human-review, correction, and release loop",
      discussion_url: discussions.content_growth.url,
    },
    {
      id: "formal-operating-model",
      status: "gated",
      label: "Effective governance and value distribution",
      evidence: "Sustainable operations, professional review, versioned terms, effective date, and participant consent",
      discussion_url: discussions.economics.url,
    },
  ],
  calls_to_participate: [
    "Critique the proposed project model",
    "Comment on public drafts and remade test videos",
    "Propose sourced historical context for charts",
    "Help design the later editorial email workflow",
    "Legal, tax, privacy, crime-data, journalism, accessibility, security, and reliability experts can challenge the relevant public review thread"
  ],
  links: {
    repository: "https://github.com/hadi-nayebi/crime-cartography",
    project_page: "https://hadi-nayebi.github.io/projects/crime-cartography.html",
    channel: "https://www.youtube.com/@CrimeCartography",
    discussions: "https://github.com/hadi-nayebi/crime-cartography/discussions"
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
  "roadmap",
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

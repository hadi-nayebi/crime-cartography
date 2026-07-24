import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "../..");

test("public project status exposes only the curated contract", async () => {
  const status = JSON.parse(await readFile(join(root, "public/project-status.json"), "utf8"));
  assert.deepEqual(Object.keys(status), [
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
  ]);
  assert.deepEqual(Object.keys(status.production), [
    "cities_mapped",
    "inherited_reference_cuts",
    "reference_cuts_awaiting_remake_review",
    "dedicated_remakes_completed",
    "dedicated_remakes_approved",
    "previously_published_on_earthone",
  ]);
  assert.equal(status.operating_tracks.release.status, "active");
  assert.equal(status.operating_tracks.release.waits_for_project_subscribers, false);
  assert.match(status.operating_tracks.community_editorial.activation, /500 project subscribers/);
  assert.equal(status.production.inherited_reference_cuts, 20);
  assert.equal(status.production.dedicated_remakes_completed, 0);
  assert.equal(status.production.dedicated_remakes_approved, 0);
  assert.equal(status.production.previously_published_on_earthone, 3);
  assert.equal(status.roadmap.length, 6);
  assert.match(status.roadmap[0].discussion_url, /\/discussions\/5$/);
  assert.equal(JSON.stringify(status).includes("earthone@"), false);
  assert.equal(JSON.stringify(status).includes("/home/"), false);
  assert.equal(JSON.stringify(status).includes("raw_feedback"), false);
  assert.equal(JSON.stringify(status).includes("feedback.json"), false);
  assert.equal(JSON.stringify(status).includes("confidence"), false);
});

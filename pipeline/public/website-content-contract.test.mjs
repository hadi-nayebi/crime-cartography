import assert from "node:assert/strict";
import {access, readFile} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mapPath = join(root, "context/WEBSITE-CONTENT-MAP.json");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("every website content block resolves to canonical repository sources", async () => {
  const map = await readJson(mapPath);
  assert.equal(map.schema_version, "1.0.0");
  assert.match(map.invariant, /may not originate project facts/i);
  assert.deepEqual(
    Object.keys(map.blocks).sort(),
    [
      "crime-define",
      "crime-hero",
      "crime-join",
      "crime-mobile-actions",
      "crime-page",
      "crime-project-card",
      "crime-understand",
    ],
  );
  for (const [blockId, block] of Object.entries(map.blocks)) {
    assert.ok(block.sources.length, `${blockId} must declare at least one source`);
    for (const source of block.sources) {
      await access(join(root, source));
    }
  }
});

test("every canonical Discussion has a substantive source body", async () => {
  const map = await readJson(mapPath);
  const registry = await readJson(join(root, "experiment/DISCUSSION-REGISTRY.json"));
  assert.equal(registry.schema_version, "2.0.0");

  const registered = Object.values(registry.threads);
  assert.equal(registered.length, 8);
  for (const thread of registered) {
    assert.ok(thread.title, `Discussion #${thread.number} needs a canonical title`);
    const expectedSource = map.discussion_sources[String(thread.number)];
    assert.equal(thread.source_body, expectedSource);
    const body = await readFile(join(root, expectedSource), "utf8");
    assert.ok(body.length > 700, `${expectedSource} needs substantive context`);
    assert.match(body, /## What|## Current|## Known|## Three questions/);
    const numberedQuestions = body.match(/^\d\. /gm) ?? [];
    assert.equal(numberedQuestions.length, 3, `${expectedSource} must ask exactly three focused questions`);
  }
});

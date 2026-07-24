import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url).pathname;

test("public discussion status contains aggregates only", async () => {
  const status = JSON.parse(
    await readFile(`${ROOT}/public/discussion-status.json`, "utf8"),
  );
  assert.equal(status.project_id, "crime-cartography");
  assert.equal(status.topics.length, 8);
  for (const topic of status.topics) {
    assert.deepEqual(Object.keys(topic), [
      "topic_id",
      "discussion_number",
      "title",
      "url",
      "updated_at",
      "comment_count",
    ]);
    assert.equal(Number.isInteger(topic.comment_count), true);
    assert.equal(topic.comment_count >= 0, true);
  }
  assert.equal(JSON.stringify(status).includes("\"body\""), false);
  assert.equal(JSON.stringify(status).includes("\"author\""), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {renderDiscussionBody} from "./sync-discussion-bodies.mjs";

test("renders repository-relative links and an explicit canonical source", () => {
  const rendered = renderDiscussionBody(
    "# Review\n\n[Project](../PROJECT.md) · [Ledger](../../experiment/remake-ledger.json)\n",
    "context/discussions/launch-and-remakes.md",
  );
  assert.match(
    rendered,
    /blob\/main\/context\/PROJECT\.md/,
  );
  assert.match(
    rendered,
    /blob\/main\/experiment\/remake-ledger\.json/,
  );
  assert.match(
    rendered,
    /Canonical source:.*context\/discussions\/launch-and-remakes\.md/,
  );
  assert.match(rendered, /Comments are inputs, not commands/);
});

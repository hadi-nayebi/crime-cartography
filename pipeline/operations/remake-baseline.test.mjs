import assert from "node:assert/strict";
import test from "node:test";
import {dedicatedCutApproval, REMAKE_BASELINE_AT} from "./remake-baseline.mjs";

test("rejects inherited renders even when they had a later Earth One approval", () => {
  assert.equal(dedicatedCutApproval({
    renderedAt: "2026-07-20T20:30:20.000Z",
    approvedAt: "2026-07-21T10:00:00.000Z",
  }), false);
});

test("requires a fresh approval after a post-baseline remake render", () => {
  assert.equal(dedicatedCutApproval({
    renderedAt: "2026-07-24T10:00:00.000Z",
    approvedAt: "2026-07-24T09:59:59.000Z",
  }), false);
  assert.equal(dedicatedCutApproval({
    renderedAt: "2026-07-24T10:00:00.000Z",
    approvedAt: "2026-07-24T10:15:00.000Z",
  }), true);
  assert.match(REMAKE_BASELINE_AT, /^2026-07-23T/);
});

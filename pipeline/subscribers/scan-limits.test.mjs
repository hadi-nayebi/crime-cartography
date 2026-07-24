import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveSubscriberScanLimit,
  subscriberScanLimits,
} from "./scan-limits.mjs";

test("caps subscriber mailbox work by default", () => {
  assert.equal(
    resolveSubscriberScanLimit([]),
    subscriberScanLimits.defaultMessages,
  );
});

test("accepts a bounded operator override", () => {
  assert.equal(resolveSubscriberScanLimit(["--max-messages=1200"]), 1200);
});

test("rejects invalid or unsafe scan limits", () => {
  for (const value of ["0", "-1", "nope", "2001"]) {
    assert.throws(
      () => resolveSubscriberScanLimit([`--max-messages=${value}`]),
      /positive integer|cannot exceed/,
    );
  }
});

import assert from "node:assert/strict";
import {join} from "node:path";
import test from "node:test";
import {buildRemakeLedger} from "./remake-ledger.mjs";

const root = join(import.meta.dirname, "../..");

test("builds one privacy-safe remake record for every city", async () => {
  const ledger = await buildRemakeLedger({
    root,
    generatedAt: "2026-07-23T00:00:00.000Z",
  });
  assert.equal(ledger.cities.length, 20);
  assert.deepEqual(ledger.destination, {
    project_channel: "Crime Cartography",
    other_channels_in_scope: [],
  });
  assert.equal(ledger.cities.every((city) => city.blockers.includes("needs-owner-remake-notes")), true);
  assert.equal(ledger.cities.every((city) => !JSON.stringify(city).includes("/home/")), true);
  assert.equal(ledger.cities.every((city) => !JSON.stringify(city).includes("feedback.json")), true);
});

test("captures removed publication history without treating it as a live destination", async () => {
  const ledger = await buildRemakeLedger({root});
  const removed = ledger.cities.filter((city) => city.prior_publications.length);
  assert.deepEqual(removed.map((city) => city.slug), [
    "boston-ma",
    "grand-rapids-mi",
    "washington-dc",
  ]);
  assert.equal(removed.every((city) => city.destination_status === "not-published"), true);
  assert.equal(removed.every((city) => city.prior_publications[0].removal === "permanent-delete"), true);
});

test("requires sourced context anchors for multi-decade stories", async () => {
  const ledger = await buildRemakeLedger({root});
  const multiDecade = ledger.cities.filter((city) => city.historical_span.years >= 20);
  assert.equal(multiDecade.length > 0, true);
  assert.equal(
    multiDecade.every((city) => city.blockers.includes("needs-sourced-context-anchors")),
    true,
  );
});

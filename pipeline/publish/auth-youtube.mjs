#!/usr/bin/env node

console.error(
  [
    "Legacy shared-token authorization is disabled.",
    "Open the Crime Cartography studio dashboard and use its channel-scoped",
    "connection flow. Verify the resolved channel identity, then explicitly",
    "lock Crime Cartography as the upload destination.",
  ].join(" "),
);
process.exit(1);

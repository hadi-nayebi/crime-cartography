# Crime Cartography public design changelog

This record shows how human review changes the project. It is not a raw comment
archive. Each entry names the input source, resolution owner, affected public
contract, and whether the change is operating or still proposed.

## 2026-07-23 — dedicated-channel boundary

- Input: owner review.
- Resolution: Crime Cartography is the only destination; Earth One is out of
  scope and its three Crime Cartography uploads were removed.
- Effect: channel-scoped OAuth and a separate immutable destination lock are
  required for every YouTube mutation.
- Status: operating.

## 2026-07-23 — launch and community clocks separated

- Input: owner review.
- Resolution: Hadi edits and launches the introduction and first pilot remakes
  without waiting for subscribers. The 500 project-request mark is a later
  editorial-readiness milestone, not permission to start the channel.
- Effect: public roadmap, intro script, dashboard, and status projection.
- Status: operating direction; publication actions remain separately gated.

## 2026-07-23 — phone-first project room and canonical discussions

- Input: owner pre-launch website review.
- Resolution: reduce manifesto density, surface a compact roadmap and subscribe
  action on phones, and route each stable milestone/expert area to one canonical
  GitHub Discussion.
- Effect: mobile action bar, collapsed deep sections, commentable roadmap,
  expert review lanes, stable discussion registry, and read-only discussion
  ingestion contract.
- Status: implemented locally; deployment remains gated.

## Resolution protocol

Future entries should include:

1. stable topic or contribution pointer;
2. evidence and competing considerations;
3. owner/authorized decision-maker;
4. accepted, rejected, deferred, or experiment status;
5. affected versioned artifacts; and
6. verification after implementation.

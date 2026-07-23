// Owner ruling: every inherited Earth One cut enters the dedicated-channel
// remake. A pre-takeover render or approval cannot light the release gate.
export const REMAKE_BASELINE_AT = "2026-07-23T18:50:58.958Z";

const timeOf = (value) => {
  const timestamp = new Date(value ?? "").getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export function dedicatedCutApproval({renderedAt, approvedAt}) {
  const baseline = timeOf(REMAKE_BASELINE_AT);
  const rendered = timeOf(renderedAt);
  const approved = timeOf(approvedAt);
  return Boolean(
    baseline !== null &&
    rendered !== null &&
    approved !== null &&
    rendered >= baseline &&
    approved >= rendered
  );
}

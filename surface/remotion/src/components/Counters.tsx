import React from "react";
import type { CatCounts } from "../data/types";
import { cumulativeAtMonth, groupATotal } from "../data/load";
import { fmtInt } from "../data/derive";
import { CAT_COLORS, CAT_LABELS, GROUP_A, COLORS, FONT_MONO } from "../theme";

interface Props {
  cityMonthly: CatCounts[];
  monthFloat: number;
  /** first year of the granular era (derived from summary.dateMin). */
  sinceYear?: string;
  /** label for the dimmed non-Group-A context row (dataset-specific). */
  otherLabel?: string;
}

// Top-right counters. Headline is GROUP A cumulative (persons + property +
// society) — the comparable serious-crime tally — explicitly labeled as a total
// since 2023 so it is NOT confused with the per-month averages of the history
// era. Local/ordinance counts are shown separately and dimmed as context, so the
// jump from UCR (Violent+Property) to NIBRS doesn't read as "crime exploded".
export const Counters: React.FC<Props> = ({ cityMonthly, monthFloat, sinceYear, otherLabel }) => {
  const cum = cumulativeAtMonth(cityMonthly, monthFloat);
  const groupA = groupATotal(cum);
  return (
    <div
      style={{
        position: "absolute",
        top: 30,
        right: 34,
        width: 380,
        fontFamily: FONT_MONO,
        textAlign: "right",
      }}
    >
      <div style={{ fontSize: 13, letterSpacing: 3, color: COLORS.inkFaint, marginBottom: 6 }}>
        GROUP A · TOTAL SINCE {sinceYear ?? "START"}
      </div>
      <div
        style={{
          fontSize: 58,
          fontWeight: 700,
          color: COLORS.ink,
          lineHeight: 1,
          marginBottom: 2,
        }}
      >
        {fmtInt(groupA)}
      </div>
      <div style={{ fontSize: 13, color: COLORS.inkFaint, marginBottom: 14 }}>
        persons + property + society · cumulative
      </div>
      {GROUP_A.map((cat) => (
        <div
          key={cat}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            marginBottom: 7,
          }}
        >
          <span style={{ fontSize: 16, color: COLORS.inkDim }}>{CAT_LABELS[cat]}</span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: CAT_COLORS[cat],
              minWidth: 92,
              textAlign: "right",
            }}
          >
            {fmtInt(cum[cat])}
          </span>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: CAT_COLORS[cat] }} />
        </div>
      ))}
      {/* Local/ordinance shown separately + dimmed — different category, not Group A */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
          marginTop: 6,
          paddingTop: 8,
          borderTop: "1px solid rgba(125,145,175,0.18)",
          opacity: 0.7,
        }}
      >
        <span style={{ fontSize: 14, color: COLORS.inkFaint }}>{otherLabel ?? "Other (context)"}</span>
        <span style={{ fontSize: 18, color: CAT_COLORS.other, minWidth: 92, textAlign: "right" }}>
          {fmtInt(cum.other)}
        </span>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: CAT_COLORS.other }} />
      </div>
    </div>
  );
};

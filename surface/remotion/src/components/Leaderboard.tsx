import React from "react";
import type { Stats } from "../data/derive";
import { cumulativeAtMonth, groupATotal } from "../data/load";
import { fmtInt } from "../data/derive";
import { COLORS, FONT_MONO } from "../theme";

interface Props {
  stats: Stats;
  /** granular-era month float (0..42 into the GRPD timeline). */
  gFloat: number;
  opacity: number;
  topN?: number;
  /** counted-category label (config.copy.countTerm); neutral fallback "reported".
   *  Non-NIBRS cities are NOT "Group A" — never assert that taxonomy on screen. */
  countTerm?: string;
}

const X = 1426;
const W = 460;
const TOP = 368; // clears the enlarged Counters block above
const ROW_H = 48;

// Live leaderboard — ranks NEIGHBORHOODS by cumulative Group A so far, by their
// resident-known names (not the opaque beat codes). Appears in the granular era
// ("as we get more data"), updating as the sweep progresses.
export const Leaderboard: React.FC<Props> = ({ stats, gFloat, opacity, topN = 6, countTerm }) => {
  if (opacity <= 0.001) return null;
  const term = countTerm ?? "reported";

  const ranked = stats.hoods
    .map((h) => ({
      name: h.name,
      val: groupATotal(cumulativeAtMonth(h.series, gFloat)),
    }))
    .sort((a, b) => b.val - a.val);

  const top = ranked.slice(0, topN);
  const maxVal = top[0]?.val || 1;

  return (
    <div style={{ position: "absolute", left: X, top: TOP, width: W, opacity, fontFamily: FONT_MONO }}>
      <div style={{ fontSize: 18, letterSpacing: 1, whiteSpace: "nowrap", color: COLORS.inkFaint, marginBottom: 12 }}>
        BUSIEST NEIGHBORHOODS · {term.toUpperCase()} TO DATE
      </div>
      <div style={{ position: "relative", height: topN * ROW_H }}>
        {top.map((h, rank) => {
          const w = (h.val / maxVal) * 100;
          const isTop = rank === 0;
          return (
            <div
              key={h.name}
              style={{
                position: "absolute",
                top: rank * ROW_H,
                left: 0,
                right: 0,
                height: ROW_H - 8,
                display: "flex",
                alignItems: "center",
                gap: 9,
              }}
            >
              <span style={{ width: 20, fontSize: 19, color: COLORS.inkFaint, textAlign: "right", flex: "0 0 auto" }}>
                {rank + 1}
              </span>
              <span
                style={{
                  width: 180,
                  fontSize: 19,
                  color: isTop ? "#ff2e63" : COLORS.inkDim,
                  fontWeight: isTop ? 700 : 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  flex: "0 0 auto",
                }}
              >
                {h.name}
              </span>
              <div style={{ flex: 1, height: 16, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                <div
                  style={{
                    width: `${w}%`,
                    height: "100%",
                    borderRadius: 3,
                    background: isTop ? "#ff2e63" : "rgba(120,180,220,0.5)",
                  }}
                />
              </div>
              <span style={{ width: 64, fontSize: 19, color: COLORS.ink, textAlign: "right", flex: "0 0 auto" }}>
                {fmtInt(h.val)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

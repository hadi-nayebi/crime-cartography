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
}

const X = 1486;
const W = 400;
const TOP = 300;
const ROW_H = 44;

// Live leaderboard — ranks NEIGHBORHOODS by cumulative Group A so far, by their
// resident-known names (not the opaque beat codes). Appears in the granular era
// ("as we get more data"), updating as the sweep progresses.
export const Leaderboard: React.FC<Props> = ({ stats, gFloat, opacity, topN = 6 }) => {
  if (opacity <= 0.001) return null;

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
      <div style={{ fontSize: 13, letterSpacing: 3, color: COLORS.inkFaint, marginBottom: 12 }}>
        BUSIEST NEIGHBORHOODS · GROUP A TO DATE
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
              <span style={{ width: 16, fontSize: 15, color: COLORS.inkFaint, textAlign: "right", flex: "0 0 auto" }}>
                {rank + 1}
              </span>
              <span
                style={{
                  width: 150,
                  fontSize: 14.5,
                  color: isTop ? "#ff2e63" : COLORS.inkDim,
                  fontWeight: isTop ? 700 : 400,
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
              <span style={{ width: 52, fontSize: 15, color: COLORS.ink, textAlign: "right", flex: "0 0 auto" }}>
                {fmtInt(h.val)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

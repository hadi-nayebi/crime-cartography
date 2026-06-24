import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import type { Summary } from "../data/types";
import type { Stats } from "../data/derive";
import { fmtInt } from "../data/derive";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  stats: Stats;
  summary: Summary;
  durationInFrames: number;
}

const SAFE = "#36e07a";
const BUSY = "#ff2e63";

// Reveal — freeze and rank. LEFT: busiest beats by Group A. RIGHT: the quiz
// payoff — the beats with the FEWEST reported Group A crimes ("safest"), called
// out honestly as report counts, not per-capita. Every figure is a real
// period total.
export const Reveal: React.FC<Props> = ({ stats, summary, durationInFrames }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const fadeOut = interpolate(frame, [durationInFrames - 24, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const busiest = stats.ranking.slice(0, 6);
  const maxA = busiest[0]?.groupATotalAll || 1;
  // fewest Group A → "safest". ranking is desc, so the tail; show fewest first.
  const safest = stats.ranking.slice(-3).reverse();
  const answer = safest[0];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 90px",
        opacity,
        background: "rgba(4,6,9,0.62)",
        fontFamily: FONT_SANS,
        color: COLORS.ink,
      }}
    >
      <div style={{ fontFamily: FONT_MONO, fontSize: 16, letterSpacing: 5, color: COLORS.inkFaint, marginBottom: 18 }}>
        {summary.dateMin} → {summary.dateMax} · {fmtInt(stats.grandTotalGroupA)} Group A
        (persons + property + society) incidents over {summary.months} months
      </div>

      <div style={{ display: "flex", gap: 56 }}>
        {/* LEFT — busiest */}
        <div style={{ flex: 1.25 }}>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 18, color: BUSY }}>
            Busiest beats — most Group A crime
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {busiest.map((b, i) => {
              const rowReveal = interpolate(frame, [10 + i * 6, 28 + i * 6], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const w = (b.groupATotalAll / maxA) * 100 * rowReveal;
              return (
                <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ width: 140, fontFamily: FONT_MONO, fontSize: 20, color: i === 0 ? BUSY : COLORS.inkDim, fontWeight: i === 0 ? 700 : 400 }}>
                    {b.key}
                  </span>
                  <div style={{ flex: 1, height: 22, background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
                    <div style={{ width: `${w}%`, height: "100%", borderRadius: 4, background: i === 0 ? BUSY : "rgba(120,180,220,0.5)" }} />
                  </div>
                  <span style={{ width: 96, fontFamily: FONT_MONO, fontSize: 20, textAlign: "right" }}>
                    {fmtInt(b.groupATotalAll)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — quiz answer / safest */}
        <div style={{ flex: 1, borderLeft: "1px solid rgba(125,145,175,0.22)", paddingLeft: 48 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 13, letterSpacing: 4, color: SAFE, marginBottom: 6 }}>
            QUIZ ANSWER
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 4, color: SAFE }}>
            Fewest reported Group A
          </div>
          {answer && (
            <div
              style={{
                opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                fontSize: 56,
                fontWeight: 800,
                color: COLORS.ink,
                margin: "6px 0 2px",
                fontFamily: FONT_MONO,
              }}
            >
              {answer.key}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
            {safest.map((b, i) => {
              const rowReveal = interpolate(frame, [46 + i * 8, 64 + i * 8], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 12, opacity: rowReveal }}>
                  <span style={{ width: 22, fontFamily: FONT_MONO, fontSize: 16, color: SAFE, textAlign: "right" }}>{i + 1}</span>
                  <span style={{ flex: 1, fontFamily: FONT_MONO, fontSize: 19, color: i === 0 ? COLORS.ink : COLORS.inkDim, fontWeight: i === 0 ? 700 : 400 }}>
                    {b.key}
                  </span>
                  <span style={{ width: 70, fontFamily: FONT_MONO, fontSize: 18, textAlign: "right", color: SAFE }}>
                    {fmtInt(b.groupATotalAll)}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 14, color: COLORS.inkFaint, marginTop: 16, lineHeight: 1.45 }}>
            "Safest" = fewest reported Group A incidents. Report counts only — not
            adjusted for population or area.
          </div>
        </div>
      </div>
    </div>
  );
};

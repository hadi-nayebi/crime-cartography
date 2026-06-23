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

// Reveal (3:30–4:30) — freeze and rank. Top beats by Group A crime, the busiest
// beat, the category split. Every figure is a real period total.
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

  const top = stats.ranking.slice(0, 8);
  const maxA = top[0]?.groupATotalAll || 1;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 120px",
        opacity,
        background: "rgba(4,6,9,0.55)",
        fontFamily: FONT_SANS,
        color: COLORS.ink,
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 16,
          letterSpacing: 5,
          color: COLORS.inkFaint,
          marginBottom: 8,
        }}
      >
        {summary.dateMin} → {summary.dateMax} · {fmtInt(stats.grandTotalGroupA)} Group A
        (persons + property + society) incidents
      </div>
      <div style={{ fontSize: 46, fontWeight: 700, marginBottom: 30 }}>
        Busiest beats — Crimes Against Persons, Property &amp; Society
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {top.map((b, i) => {
          const rowReveal = interpolate(
            frame,
            [10 + i * 6, 28 + i * 6],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const w = (b.groupATotalAll / maxA) * 100 * rowReveal;
          return (
            <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <span
                style={{
                  width: 150,
                  fontFamily: FONT_MONO,
                  fontSize: 22,
                  color: i === 0 ? "#ff2e63" : COLORS.inkDim,
                  fontWeight: i === 0 ? 700 : 400,
                }}
              >
                {b.key}
              </span>
              <div style={{ flex: 1, height: 26, background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
                <div
                  style={{
                    width: `${w}%`,
                    height: "100%",
                    borderRadius: 4,
                    background: i === 0 ? "#ff2e63" : "rgba(120,180,220,0.55)",
                  }}
                />
              </div>
              <span style={{ width: 110, fontFamily: FONT_MONO, fontSize: 22, textAlign: "right" }}>
                {fmtInt(b.groupATotalAll)}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 30, fontSize: 26, color: COLORS.inkDim, lineHeight: 1.5 }}>
        {top[0] && (
          <>
            <b style={{ color: COLORS.ink }}>{top[0].key}</b> (downtown) leads with{" "}
            {fmtInt(top[0].groupATotalAll)} Group A incidents over {summary.months} months.
          </>
        )}
      </div>
    </div>
  );
};

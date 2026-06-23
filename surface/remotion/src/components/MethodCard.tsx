import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import type { Summary } from "../data/types";
import { fmtInt } from "../data/derive";
import { CAT_COLORS, CAT_LABELS, CATS, COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  summary: Summary;
  durationInFrames: number;
}

// One-time honesty card (0:20–0:45). Establishes the data contract on screen:
// no individual incidents are plotted; symbols are per-beat aggregates; states
// the coverage figure and the honest category split incl. Local/Other.
export const MethodCard: React.FC<Props> = ({ summary, durationInFrames }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const fadeOut = interpolate(frame, [durationInFrames - 22, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        background: "rgba(4,6,9,0.62)",
      }}
    >
      <div
        style={{
          width: 1080,
          padding: "44px 52px",
          borderRadius: 18,
          background: "rgba(10,13,19,0.92)",
          border: `1px solid ${COLORS.panelStroke}`,
          fontFamily: FONT_SANS,
          color: COLORS.ink,
        }}
      >
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 15,
            letterSpacing: 4,
            color: COLORS.inkFaint,
            marginBottom: 18,
          }}
        >
          HOW TO READ THIS MAP
        </div>
        <div style={{ fontSize: 34, lineHeight: 1.4, fontWeight: 500 }}>
          The public GRPD data carries <b>no incident coordinates</b>. So no
          individual incidents are plotted. Each glowing symbol is a{" "}
          <b>per-beat aggregate</b> placed at that police beat&rsquo;s centroid;
          fill intensity is the beat&rsquo;s recent rate.
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: 24,
            lineHeight: 1.5,
            color: COLORS.inkDim,
          }}
        >
          {fmtInt(summary.totalRecords)} records, {summary.dateMin} →{" "}
          {summary.dateMax}. {summary.coveragePct}% mapped to one of{" "}
          {summary.beatCount} beats; the rest are kept in the totals and
          disclosed, never invented onto the map.
        </div>
        <div style={{ display: "flex", gap: 26, marginTop: 26, flexWrap: "wrap" }}>
          {CATS.map((cat) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  background: CAT_COLORS[cat],
                }}
              />
              <span style={{ fontSize: 19, color: COLORS.inkDim }}>
                {CAT_LABELS[cat]} · {fmtInt(summary.catTotals[cat])}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

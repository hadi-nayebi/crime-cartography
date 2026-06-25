import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import type { HistoryFile, Summary } from "../data/types";
import { fmtInt } from "../data/derive";
import { CAT_COLORS, CAT_LABELS, CATS, COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  summary: Summary;
  history: HistoryFile | null;
  durationInFrames: number;
}

// One-time honesty card. Establishes the full data contract on screen: the two
// eras (FBI UCR annual history shown per year, then granular GRPD NIBRS shown
// per month), that no incidents are geolocated, that dots are density within a
// beat (not locations), the coverage figure, and the honest category split.
export const MethodCard: React.FC<Props> = ({ summary, history, durationInFrames }) => {
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
        <div style={{ fontSize: 32, lineHeight: 1.4, fontWeight: 500 }}>
          Two honest eras. <b>{history ? history.yearMin : 2000}–{history ? history.yearMax : 2022}</b>{" "}
          uses real <b>FBI UCR annual totals</b>, counted <b>per year</b>. From{" "}
          <b>2023</b> it switches to granular <b>GRPD NIBRS</b> data — real counts{" "}
          <b>per month</b>, per police beat.
        </div>
        <div style={{ fontSize: 28, lineHeight: 1.4, fontWeight: 500, marginTop: 16 }}>
          The GRPD data has <b>no incident coordinates</b>, so nothing is
          geolocated. Each <b>dot is density, not a location</b> — dots are spread
          within a beat to show <i>how many</i>, never <i>where</i>.
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 23,
            lineHeight: 1.5,
            color: COLORS.inkDim,
          }}
        >
          {fmtInt(summary.totalRecords)} GRPD records, {summary.dateMin} →{" "}
          {summary.dateMax}. {summary.coveragePct}% mapped to one of{" "}
          {summary.beatCount} beats; the rest are kept in the totals and
          disclosed, never invented onto the map. UCR (pre-2023) and NIBRS
          (2023+) are different taxonomies — not directly comparable.
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

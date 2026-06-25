import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import type { Summary } from "../data/types";
import { fmtInt } from "../data/derive";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  summary: Summary;
  durationInFrames: number;
  repoUrl: string;
}

// Close (4:30–5:00) — recap, full source + license credit, repo URL, the
// data-honest sign-off.
export const Credits: React.FC<Props> = ({ summary, durationInFrames, repoUrl }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const fadeOut = interpolate(frame, [durationInFrames - 30, durationInFrames], [1, 0.0], {
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
        textAlign: "center",
        fontFamily: FONT_SANS,
        color: COLORS.ink,
      }}
    >
      <div style={{ fontSize: 56, fontWeight: 700, maxWidth: 1200, lineHeight: 1.12 }}>
        Grand Rapids · 2000–2026
      </div>
      <div style={{ marginTop: 18, fontSize: 30, color: COLORS.ink, maxWidth: 1100, lineHeight: 1.4 }}>
        {fmtInt(summary.totalRecords)} reported records · {summary.beatCount}{" "}
        police beats · {summary.months} months of NIBRS detail
      </div>
      <div style={{ marginTop: 28, fontSize: 24, color: COLORS.inkDim, maxWidth: 1180, lineHeight: 1.5 }}>
        Sources: Grand Rapids Police Department crime data (2023–) &amp; FBI UCR
        (2000–2022) via the City of Grand Rapids ArcGIS Hub. Beat polygons: GRPD
        Service Area Map. Neighborhood names: City of Grand Rapids Neighborhood
        Areas. Used under the City of Grand Rapids GIS Data Access &amp; Use
        Constraint Agreement (provided &ldquo;as is&rdquo;).
      </div>
      <div
        style={{
          marginTop: 26,
          fontFamily: FONT_MONO,
          fontSize: 22,
          color: COLORS.inkDim,
        }}
      >
        {summary.source.hub}
      </div>
      <div
        style={{
          marginTop: 14,
          fontFamily: FONT_MONO,
          fontSize: 15,
          color: COLORS.inkFaint,
        }}
      >
        Music generated with Stable Audio Open (Stability AI)
      </div>
      <div
        style={{
          marginTop: 40,
          fontFamily: FONT_MONO,
          fontSize: 24,
          letterSpacing: 2,
          color: COLORS.ink,
        }}
      >
        {repoUrl}
      </div>
      <div
        style={{
          marginTop: 14,
          fontFamily: FONT_MONO,
          fontSize: 15,
          letterSpacing: 5,
          color: COLORS.inkFaint,
        }}
      >
        OPEN DATA · OPEN SOURCE
      </div>
    </div>
  );
};

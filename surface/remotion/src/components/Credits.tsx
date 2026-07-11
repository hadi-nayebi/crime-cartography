import React from "react";
import { interpolate, useCurrentFrame, spring, useVideoConfig, Easing } from "remotion";
import type { Summary } from "../data/types";
import { fmtInt } from "../data/derive";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";
import { CUE_ACCENT, CUE_ICON, CUE_LABEL, CUE_ORDER } from "./SocialCue";

interface Props {
  summary: Summary;
  durationInFrames: number;
  repoUrl: string;
  /** e.g. "Grand Rapids · 2000–2026" — city + full covered span. */
  headline?: string;
  /** full sources + license paragraph (config.copy.creditsSources). */
  sources?: string;
  musicCredit?: string;
  /** noun for the mapping unit in the stats line. */
  regionNounPlural?: string;
}

// Close (4:30–5:00) — recap, full source + license credit, repo URL, the
// data-honest sign-off.
export const Credits: React.FC<Props> = ({
  summary,
  durationInFrames,
  repoUrl,
  headline,
  sources,
  musicCredit,
  regionNounPlural,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cuePop = spring({ frame: frame - 20, fps, config: { damping: 15, mass: 0.7 }, durationInFrames: 24 });
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
        {headline ?? summary.title}
      </div>
      <div style={{ marginTop: 18, fontSize: 30, color: COLORS.ink, maxWidth: 1100, lineHeight: 1.4 }}>
        {fmtInt(summary.totalRecords)} reported records · {summary.beatCount}{" "}
        {regionNounPlural ?? "districts"} · {summary.months} months of detail
      </div>

      {/* Call to action */}
      <div
        style={{
          marginTop: 34,
          display: "flex",
          gap: 16,
          transform: `translateY(${interpolate(cuePop, [0, 1], [24, 0])}px)`,
          opacity: cuePop,
        }}
      >
        {CUE_ORDER.map((kind) => (
          <div
            key={kind}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              padding: "11px 20px",
              borderRadius: 14,
              background: "rgba(10,13,19,0.9)",
              border: `1px solid ${CUE_ACCENT[kind]}66`,
            }}
          >
            <svg width={22} height={22} viewBox="0 0 24 24" fill={CUE_ACCENT[kind]}>
              <path d={CUE_ICON[kind]} />
            </svg>
            <span style={{ fontSize: 22, fontWeight: 700, color: COLORS.ink }}>{CUE_LABEL[kind]}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 20, color: COLORS.inkFaint, fontFamily: FONT_MONO, letterSpacing: 1 }}>
        every number here is reproducible · full code, data &amp; sources on GitHub
      </div>
      <div style={{ marginTop: 28, fontSize: 24, color: COLORS.inkDim, maxWidth: 1180, lineHeight: 1.5 }}>
        {sources ?? `Source: ${summary.source.hub}`}
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
          fontSize: 18,
          color: COLORS.inkFaint,
        }}
      >
        {musicCredit ?? "Music generated with Stable Audio Open (Stability AI)"}
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
          fontSize: 18,
          letterSpacing: 5,
          color: COLORS.inkFaint,
        }}
      >
        OPEN DATA · OPEN SOURCE
      </div>
    </div>
  );
};

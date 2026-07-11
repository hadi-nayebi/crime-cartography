import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_SANS } from "../theme";

export type CueKind = "like" | "subscribe" | "share";

interface Props {
  kind: CueKind;
  durationInFrames: number;
}

// Material-symbol paths (Apache-2.0), 24×24 viewBox.
const ICON: Record<CueKind, string> = {
  like: "M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z",
  subscribe:
    "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  share:
    "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z",
};
const LABEL: Record<CueKind, string> = { like: "Like", subscribe: "Subscribe", share: "Share" };
const HINT: Record<CueKind, string> = {
  like: "if this was worth a look",
  subscribe: "for the next city",
  share: "with someone from here",
};
const ACCENT: Record<CueKind, string> = { like: "#34e0e0", subscribe: "#ff2e63", share: "#ffc233" };

// Re-exported so the outro end-card can render a matching CTA row.
export const CUE_ICON = ICON;
export const CUE_LABEL = LABEL;
export const CUE_ACCENT = ACCENT;
export const CUE_ORDER: CueKind[] = ["like", "subscribe", "share"];

// A small "drop" — a corner CTA pill that springs up from the lower edge, holds,
// then slides away. Non-intrusive; sits above the persistent source credit.
export const SocialCue: React.FC<Props> = ({ kind, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.7 }, durationInFrames: 20 });
  const exit = interpolate(frame, [durationInFrames - 16, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(enter, [0, 1], [70, 0]) + interpolate(exit, [0, 1], [0, 70]);
  const opacity = Math.min(enter, 1 - exit);
  const accent = ACCENT[kind];

  return (
    <div
      style={{
        position: "absolute",
        right: 44,
        bottom: 78,
        transform: `translateY(${y}px)`,
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 20px 12px 14px",
        borderRadius: 16,
        background: "rgba(10,13,19,0.94)",
        border: `1px solid ${accent}66`,
        boxShadow: `0 8px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.3)`,
        fontFamily: FONT_SANS,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: `${accent}22`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={24} height={24} viewBox="0 0 24 24" fill={accent}>
          <path d={ICON[kind]} />
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: COLORS.ink }}>{LABEL[kind]}</span>
        <span style={{ fontSize: 17, color: COLORS.inkDim }}>{HINT[kind]}</span>
      </div>
    </div>
  );
};

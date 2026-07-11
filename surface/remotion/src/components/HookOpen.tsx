import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  /** verified shock stat, e.g. "−51%" — the pattern interrupt (0–3s). */
  stat: string;
  /** what the stat is, e.g. "Chicago's reported crime since 2001". */
  line: string;
  /** optional qualifier under the line (source/measure). */
  sub?: string;
  title: string;
  subtitle: string;
  durationInFrames: number;
  accent?: string;
}

// Cold open rebuilt as a retention hook (research: the steepest drop is
// seconds 10–20; the payoff must land by ~15s). Structure inside 8s:
//   0.0–0.7s  black beat
//   0.7–3.2s  the STAT slams in huge (pattern interrupt) + its meaning line
//   3.2–8.0s  title + subtitle arrive below (promise), everything eases out
export const HookOpen: React.FC<Props> = ({
  stat,
  line,
  sub,
  title,
  subtitle,
  durationInFrames,
  accent = "#ffb020",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const statPop = spring({ frame: frame - Math.round(0.7 * fps), fps, config: { damping: 11, mass: 0.9, stiffness: 130 }, durationInFrames: 26 });
  const lineIn = interpolate(frame, [Math.round(1.4 * fps), Math.round(2.2 * fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const titleIn = interpolate(frame, [Math.round(3.2 * fps), Math.round(4.2 * fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const fadeOut = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut,
        textAlign: "center",
        fontFamily: FONT_SANS,
      }}
    >
      {/* the stat — pattern interrupt */}
      <div
        style={{
          fontSize: 210,
          fontWeight: 900,
          lineHeight: 0.95,
          color: accent,
          transform: `scale(${0.6 + statPop * 0.4})`,
          opacity: statPop,
          textShadow: `0 0 90px ${accent}55`,
        }}
      >
        {stat}
      </div>
      <div
        style={{
          marginTop: 18,
          fontSize: 40,
          fontWeight: 700,
          color: COLORS.ink,
          opacity: lineIn,
          transform: `translateY(${(1 - lineIn) * 16}px)`,
          maxWidth: 1300,
          lineHeight: 1.15,
        }}
      >
        {line}
      </div>
      {sub && (
        <div style={{ marginTop: 10, fontFamily: FONT_MONO, fontSize: 17, color: COLORS.inkDim, opacity: lineIn }}>
          {sub}
        </div>
      )}

      {/* the promise — title arrives under the stat */}
      <div style={{ marginTop: 44, opacity: titleIn, transform: `translateY(${(1 - titleIn) * 14}px)` }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 14, letterSpacing: 6, color: COLORS.inkFaint, marginBottom: 10 }}>
          CRIME CARTOGRAPHY
        </div>
        <div style={{ fontSize: 44, fontWeight: 700, color: COLORS.ink, maxWidth: 1250, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 21, color: COLORS.inkDim, marginTop: 10 }}>{subtitle}</div>
      </div>
    </div>
  );
};

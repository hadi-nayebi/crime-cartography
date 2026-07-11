import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  /** beat-name options, already ordered (answer not revealed). */
  options: string[];
  durationInFrames: number;
  /** city-specific question (from config.copy); engine default is neutral. */
  question?: string;
  /** e.g. "2023–2026" — derived from the dataset span. */
  spanLabel?: string;
}

// Engagement hook posed DURING the history era: ask the viewer to guess which
// neighborhood is "safest" (fewest reported Group A crimes), answered from real
// data at the reveal. Sits on the right, clear of the history bar chart.
export const Quiz: React.FC<Props> = ({ options, durationInFrames, question, spanLabel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 18, mass: 0.8 } });
  const fadeOut = interpolate(frame, [durationInFrames - 16, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(pop, fadeOut);

  return (
    <div
      style={{
        position: "absolute",
        right: 40,
        top: 300,
        width: 380,
        opacity,
        transform: `translateY(${(1 - pop) * 18}px)`,
        background: "rgba(10,13,19,0.92)",
        border: "1px solid rgba(125,145,175,0.28)",
        borderLeft: "4px solid #36e07a",
        borderRadius: 12,
        padding: "18px 20px",
        boxShadow: "0 14px 44px rgba(0,0,0,0.5)",
        fontFamily: FONT_SANS,
      }}
    >
      <div style={{ fontFamily: FONT_MONO, fontSize: 17, letterSpacing: 4, color: "#36e07a", marginBottom: 8 }}>
        QUICK QUIZ
      </div>
      <div style={{ fontSize: 23, fontWeight: 700, color: COLORS.ink, lineHeight: 1.25, marginBottom: 6 }}>
        {question ?? "Which neighborhood is the safest?"}
      </div>
      <div style={{ fontSize: 18, fontWeight: 500, color: COLORS.inkDim, marginBottom: 14 }}>
        i.e. the fewest reported Group A crimes{spanLabel ? `, ${spanLabel}` : ""}. Take a guess:
      </div>
      {options.map((opt, i) => {
        const rowReveal = interpolate(frame, [12 + i * 7, 26 + i * 7], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={opt}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 9,
              opacity: rowReveal,
              transform: `translateX(${(1 - rowReveal) * 14}px)`,
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                border: "1px solid rgba(125,145,175,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONT_MONO,
                fontSize: 18,
                color: COLORS.inkDim,
                flex: "0 0 auto",
              }}
            >
              {String.fromCharCode(65 + i)}
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 20, color: COLORS.ink }}>{opt}</span>
          </div>
        );
      })}
      <div style={{ fontSize: 17, color: COLORS.inkFaint, marginTop: 10, fontStyle: "italic" }}>
        Keep watching — answer at the end.
      </div>
    </div>
  );
};

import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { COLORS, FONT_SANS } from "../theme";

interface Props {
  text: string;
  durationInFrames: number;
  accent?: string;
}

// "Air message" — a factual callout pulled from the data. Mounted inside a
// Sequence; it fades itself in/out. Text must be checkable against timeline.json.
export const Annotation: React.FC<Props> = ({
  text,
  durationInFrames,
  accent = "#ffffff",
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 16, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(fadeIn, fadeOut);
  const rise = interpolate(fadeIn, [0, 1], [16, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: 460,
        right: 470,
        bottom: 196,
        display: "flex",
        justifyContent: "center",
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      <div
        style={{
          maxWidth: 860,
          padding: "16px 26px",
          borderRadius: 12,
          background: "rgba(8,11,16,0.86)",
          borderLeft: `4px solid ${accent}`,
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
          fontFamily: FONT_SANS,
          fontSize: 30,
          lineHeight: 1.28,
          color: COLORS.ink,
          fontWeight: 500,
        }}
      >
        {text}
      </div>
    </div>
  );
};

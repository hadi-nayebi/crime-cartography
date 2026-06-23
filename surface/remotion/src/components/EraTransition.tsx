import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  durationInFrames: number;
}

// Bridges the FBI-UCR history era and the granular GRPD/NIBRS era. Honest about
// the taxonomy change and why the map gains detail in 2023.
export const EraTransition: React.FC<Props> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const fadeOut = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);
  const rise = interpolate(fadeIn, [0, 1], [24, 0]);

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
      }}
    >
      <div
        style={{
          transform: `translateY(${rise}px)`,
          fontFamily: FONT_MONO,
          fontSize: 19,
          letterSpacing: 6,
          color: COLORS.inkFaint,
          marginBottom: 18,
        }}
      >
        2023 · GRPD NIBRS DATA BEGINS
      </div>
      <div
        style={{
          transform: `translateY(${rise}px)`,
          fontFamily: FONT_SANS,
          fontSize: 64,
          fontWeight: 800,
          color: COLORS.ink,
          maxWidth: 1280,
          lineHeight: 1.1,
        }}
      >
        The map comes alive
      </div>
      <div
        style={{
          transform: `translateY(${rise}px)`,
          fontFamily: FONT_SANS,
          fontSize: 27,
          color: COLORS.inkDim,
          maxWidth: 1080,
          marginTop: 22,
          lineHeight: 1.45,
        }}
      >
        From here the data is incident-level and per police beat — four NIBRS
        categories, real monthly counts, distributed as density within each beat.
      </div>
    </div>
  );
};

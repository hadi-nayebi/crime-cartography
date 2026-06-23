import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  title: string;
  subtitle: string;
  durationInFrames: number;
}

// Cold open (0:00–0:20) — title + source line over the city's beats fading in.
export const ColdOpen: React.FC<Props> = ({ title, subtitle, durationInFrames }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [6, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const fadeOut = interpolate(frame, [durationInFrames - 26, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);
  const rise = interpolate(fadeIn, [0, 1], [22, 0]);

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
        transform: `translateY(${rise}px)`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 17,
          letterSpacing: 7,
          color: COLORS.inkFaint,
          marginBottom: 22,
        }}
      >
        CRIME CARTOGRAPHY
      </div>
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 72,
          fontWeight: 700,
          color: COLORS.ink,
          maxWidth: 1300,
          lineHeight: 1.08,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 30,
          color: COLORS.inkDim,
          marginTop: 22,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
};

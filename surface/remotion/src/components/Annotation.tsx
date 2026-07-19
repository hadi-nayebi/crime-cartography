import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { COLORS, FONT_SANS } from "../theme";

interface Props {
  text: string;
  durationInFrames: number;
  accent?: string;
  // Which empty band to occupy so the note never lands on other text.
  //  "granular" — floats above the TimelineChart during the map chapter.
  //  "history"  — drops below the FullTrend chart/legend during the long-arc.
  region?: "granular" | "history";
}

// "Air message" — a factual callout pulled from the data. Mounted inside a
// Sequence; it fades itself in/out. Text must be checkable against the data.
// The card sits on a raised slate panel — a deliberately lighter shade than the
// near-black video background — so it reads clearly over the map.
export const Annotation: React.FC<Props> = ({
  text,
  durationInFrames,
  accent = "#ffffff",
  region = "granular",
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

  // Empty-band placement per chapter (1920×1080):
  //  granular — above the TimelineChart (top y≈864), between the Feed (left)
  //             and Leaderboard (right) columns → x[490,1420].
  //  history  — below the FullTrend chart + era legend + caption (bottom y≈895)
  //             and above the persistent source strip (top y≈1038).
  const band =
    region === "history"
      ? { left: 0, right: 0, bottom: 56, maxWidth: 980 }
      : { left: 490, right: 500, bottom: 268, maxWidth: 820 };

  return (
    <div
      style={{
        position: "absolute",
        left: band.left,
        right: band.right,
        bottom: band.bottom,
        display: "flex",
        justifyContent: "center",
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      <div
        style={{
          maxWidth: band.maxWidth,
          padding: "16px 26px",
          borderRadius: 12,
          background: "rgba(24,31,43,0.96)",
          border: "1px solid rgba(140,165,195,0.30)",
          borderLeft: `4px solid ${accent}`,
          boxShadow: "0 12px 44px rgba(0,0,0,0.55)",
          fontFamily: FONT_SANS,
          fontSize: 30,
          lineHeight: 1.3,
          color: COLORS.ink,
          fontWeight: 500,
        }}
      >
        {text}
      </div>
    </div>
  );
};

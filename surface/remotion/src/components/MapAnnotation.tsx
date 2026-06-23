import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_SANS, FRAME } from "../theme";

interface Props {
  x: number; // anchor screen x (projected beat centroid)
  y: number; // anchor screen y
  text: string;
  accent: string;
  durationInFrames: number;
}

// A callout that pops at a specific map location: a pulsing marker at the
// anchor, a connector, and a card that springs in. Card flips to whichever side
// keeps it on-screen.
export const MapAnnotation: React.FC<Props> = ({
  x,
  y,
  text,
  accent,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({ frame, fps, config: { damping: 16, mass: 0.7 } });
  const fadeOut = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(pop, fadeOut);
  const pulse = 1 + 0.3 * Math.sin(frame / 4);

  const toLeft = x > FRAME.w / 2;
  const cardW = 340;
  const gap = 26;
  const cardX = toLeft ? x - gap - cardW : x + gap;
  const cardY = Math.max(20, Math.min(FRAME.h - 160, y - 40));
  const elbowX = toLeft ? x - gap : x + gap;

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <svg width={FRAME.w} height={FRAME.h} viewBox={`0 0 ${FRAME.w} ${FRAME.h}`} style={{ position: "absolute", inset: 0 }}>
        {/* connector */}
        <line x1={x} y1={y} x2={elbowX} y2={cardY + 28} stroke={accent} strokeOpacity={0.7} strokeWidth={1.5} />
        {/* anchor marker */}
        <circle cx={x} cy={y} r={10 * pulse} fill={accent} fillOpacity={0.18} />
        <circle cx={x} cy={y} r={4.5} fill={accent} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: cardX,
          top: cardY,
          width: cardW,
          transform: `scale(${0.9 + 0.1 * pop})`,
          transformOrigin: toLeft ? "right center" : "left center",
          padding: "14px 18px",
          borderRadius: 10,
          background: "rgba(8,11,16,0.9)",
          borderLeft: `4px solid ${accent}`,
          boxShadow: "0 10px 36px rgba(0,0,0,0.55)",
          fontFamily: FONT_SANS,
          fontSize: 22,
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

import React from "react";
import { interpolate } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, PHASES } from "../theme";

interface Props {
  /** seconds into the video. */
  sec: number;
  /** city-specific chapter-2 copy (from config.copy); neutral defaults. */
  kicker?: string;
  title?: string;
  caption?: string;
}

interface Band {
  start: number;
  end: number;
  kicker: string;
  title: string;
  caption: string;
}

// Top-center strip that names the current chapter and tells a first-time viewer,
// in one line, exactly what they're looking at. Only the granular era is covered
// here — Chapter 1 (HistoryEra) carries its own centered header, so a second
// strip there would collide. Keeps every frame self-explanatory.
export const PhaseTitle: React.FC<Props> = ({ sec, kicker, title, caption }) => {
  const band: Band = {
    start: PHASES.transitionEnd,
    end: PHASES.granularEnd,
    kicker: kicker ?? "CHAPTER 2",
    title: title ?? "The map comes alive",
    caption: caption ?? "Live monthly reports by district.",
  };
  if (!(sec >= band.start - 2 && sec <= band.end + 2)) return null;
  const opacity = Math.min(
    interpolate(sec, [band.start - 2, band.start + 1.5], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(sec, [band.end - 1.5, band.end + 1.5], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  if (opacity <= 0.001) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 18,
        left: 480,
        right: 480,
        textAlign: "center",
        opacity,
        pointerEvents: "none",
        padding: "8px 0 10px",
        background:
          "radial-gradient(ellipse at 50% 40%, rgba(5,7,11,0.78), rgba(5,7,11,0) 72%)",
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 14,
          letterSpacing: 4,
          color: COLORS.inkFaint,
        }}
      >
        {band.kicker}
      </div>
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 30,
          fontWeight: 700,
          color: COLORS.ink,
          marginTop: 2,
        }}
      >
        {band.title}
      </div>
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 16,
          color: COLORS.inkDim,
          marginTop: 3,
        }}
      >
        {band.caption}
      </div>
    </div>
  );
};

import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  durationInFrames: number;
  ucrAnnual?: number; // 2022 UCR Violent+Property per year (as shown in Ch1)
  ucrMonthly?: number; // same, divided by 12
  nibrsMonthly?: number; // NIBRS Group A per month (granular era)
}

// Bridges the FBI-UCR history era and the granular GRPD/NIBRS era. Honest about
// the taxonomy change and why the map gains detail in 2023.
export const EraTransition: React.FC<Props> = ({ durationInFrames, ucrAnnual, ucrMonthly, nibrsMonthly }) => {
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

      {/* explicit scale bridge: converts Ch1's per-YEAR numbers to Ch2's per-MONTH
          rate so the two eras' figures are comparable in one place. */}
      {ucrAnnual && ucrMonthly && nibrsMonthly && (
        <div
          style={{
            transform: `translateY(${rise}px)`,
            fontFamily: FONT_MONO,
            fontSize: 19,
            color: COLORS.inkDim,
            maxWidth: 1220,
            marginTop: 30,
            lineHeight: 1.6,
            background: "rgba(10,14,20,0.6)",
            border: "1px solid rgba(125,145,175,0.22)",
            borderRadius: 12,
            padding: "16px 22px",
          }}
        >
          <span style={{ color: COLORS.ink, fontWeight: 700 }}>
            Reading the new numbers:
          </span>{" "}
          in 2022 UCR logged about{" "}
          <span style={{ color: COLORS.ink }}>{Math.round(ucrAnnual / 100) * 100}/year</span>{" "}
          Violent + Property — roughly{" "}
          <span style={{ color: COLORS.ink }}>{Math.round(ucrMonthly)}/month</span>.
          From here we count <span style={{ color: COLORS.ink }}>per month</span>. NIBRS
          Group A also includes <i>Crimes Against Society</i> and more offense types,
          so it runs about{" "}
          <span style={{ color: COLORS.ink }}>{Math.round(nibrsMonthly)}/month</span> —
          the step up is mostly{" "}
          <span style={{ color: COLORS.ink }}>what gets counted</span>, not a sudden
          crime wave.
        </div>
      )}
    </div>
  );
};

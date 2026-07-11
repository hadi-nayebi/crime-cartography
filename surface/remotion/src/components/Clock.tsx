import React from "react";
import { monthLabel } from "../data/derive";
import { COLORS, FONT_MONO } from "../theme";

interface Props {
  months: string[];
  monthFloat: number;
}

// Big MON YYYY clock, top-left, animating through the 42 months.
export const Clock: React.FC<Props> = ({ months, monthFloat }) => {
  const idx = Math.max(0, Math.min(months.length - 1, Math.floor(monthFloat)));
  const { mon, year } = monthLabel(months[idx]);
  return (
    <div
      style={{
        position: "absolute",
        top: 30,
        left: 34,
        fontFamily: FONT_MONO,
        color: COLORS.ink,
        lineHeight: 0.92,
      }}
    >
      <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: 1 }}>
        {mon}
      </div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 500,
          color: COLORS.inkDim,
          letterSpacing: 6,
        }}
      >
        {year}
      </div>
    </div>
  );
};

import React from "react";
import { COLORS, FONT_MONO } from "../theme";

interface Props {
  coveragePct: number;
  showCoverage: boolean;
  /** city-specific honesty strip text (from config.copy.sourceLine). */
  line?: string;
  /** noun for the mapping unit, e.g. "beat" / "community area". */
  regionNoun?: string;
  /** full override for the coverage readout (when the plain % would mislead,
      e.g. datasets whose spatial detail starts later than their record span). */
  coverageText?: string;
}

// Persistent on-screen honesty strip. The data-source credit is ALWAYS visible;
// the coverage figure shows whenever the map's counts are being referenced.
export const SourceCredit: React.FC<Props> = ({
  coveragePct,
  showCoverage,
  line,
  regionNoun,
  coverageText,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        background:
          "linear-gradient(to top, rgba(3,5,8,0.92), rgba(3,5,8,0))",
        fontFamily: FONT_MONO,
        fontSize: 14,
        letterSpacing: 0.3,
        color: COLORS.inkFaint,
      }}
    >
      <span>{line ?? "Open city data · every figure sourced · nothing invented"}</span>
      <span style={{ opacity: showCoverage ? 1 : 0, transition: "none" }}>
        {coverageText ?? `${coveragePct}% of records mapped to a ${regionNoun ?? "district"}`}
      </span>
    </div>
  );
};

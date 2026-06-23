import React from "react";
import { COLORS, FONT_MONO } from "../theme";

interface Props {
  coveragePct: number;
  showCoverage: boolean;
}

// Persistent on-screen honesty strip. The data-source credit is ALWAYS visible;
// the coverage figure shows whenever the map's counts are being referenced.
export const SourceCredit: React.FC<Props> = ({ coveragePct, showCoverage }) => {
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
      <span>
        Data: GRPD via City of Grand Rapids ArcGIS Hub · aggregated per police
        beat · no individual incidents plotted
      </span>
      <span style={{ opacity: showCoverage ? 1 : 0, transition: "none" }}>
        {coveragePct}% of records mapped to a beat
      </span>
    </div>
  );
};

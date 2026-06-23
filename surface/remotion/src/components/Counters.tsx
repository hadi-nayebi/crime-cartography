import React from "react";
import type { CatCounts } from "../data/types";
import { cumulativeAtMonth, totalOf } from "../data/load";
import { fmtInt } from "../data/derive";
import { CAT_COLORS, CAT_LABELS, CATS, COLORS, FONT_MONO } from "../theme";

interface Props {
  cityMonthly: CatCounts[];
  monthFloat: number;
}

// Cumulative category counters, top-right, counting up in real time. Every
// number is a true running total of sourced records.
export const Counters: React.FC<Props> = ({ cityMonthly, monthFloat }) => {
  const cum = cumulativeAtMonth(cityMonthly, monthFloat);
  const total = totalOf(cum);
  return (
    <div
      style={{
        position: "absolute",
        top: 30,
        right: 34,
        width: 360,
        fontFamily: FONT_MONO,
        textAlign: "right",
      }}
    >
      <div
        style={{
          fontSize: 13,
          letterSpacing: 3,
          color: COLORS.inkFaint,
          marginBottom: 6,
        }}
      >
        RECORDS TO DATE
      </div>
      <div
        style={{
          fontSize: 58,
          fontWeight: 700,
          color: COLORS.ink,
          lineHeight: 1,
          marginBottom: 14,
        }}
      >
        {fmtInt(total)}
      </div>
      {CATS.map((cat) => (
        <div
          key={cat}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            marginBottom: 7,
          }}
        >
          <span style={{ fontSize: 16, color: COLORS.inkDim }}>
            {CAT_LABELS[cat]}
          </span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: CAT_COLORS[cat],
              minWidth: 92,
              textAlign: "right",
            }}
          >
            {fmtInt(cum[cat])}
          </span>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              background: CAT_COLORS[cat],
            }}
          />
        </div>
      ))}
    </div>
  );
};

import React from "react";
import type { HistoryFile } from "../data/types";
import { fmtInt } from "../data/derive";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  history: HistoryFile;
  /** 0..N years elapsed across the history span (fractional). */
  yearFloat: number;
  opacity: number;
}

const X0 = 360;
const X1 = 1560;
const BASE_Y = 800;
const BAR_H = 360;

// Era 1 (2000–2022). Real FBI UCR annual totals, animated as a year-by-year
// stacked bar chart and a big "monthly average" readout. Labeled honestly:
// these are annual figures shown as a monthly average — no monthly or beat
// detail is implied.
export const HistoryEra: React.FC<Props> = ({ history, yearFloat, opacity }) => {
  const years = history.years;
  const n = years.length;
  const maxTotal = Math.max(...years.map((y) => y.total));
  const W = X1 - X0;
  const slot = W / n;
  const barW = slot * 0.62;

  const curIdx = Math.max(0, Math.min(n - 1, Math.floor(yearFloat)));
  const cur = years[curIdx];
  const monthlyAvgViolent = cur.violent / 12;
  const monthlyAvgProperty = cur.property / 12;

  const vColor = history.cats.violent.color;
  const pColor = history.cats.property.color;

  const yOf = (v: number) => BASE_Y - (v / maxTotal) * BAR_H;

  return (
    <div style={{ position: "absolute", inset: 0, opacity, fontFamily: FONT_SANS }}>
      {/* Big year + monthly-average readout (top center) */}
      <div style={{ position: "absolute", top: 70, left: 0, right: 0, textAlign: "center" }}>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 15,
            letterSpacing: 5,
            color: COLORS.inkFaint,
          }}
        >
          CHAPTER 1 · 2000–2022 · FBI UCR · ANNUAL TOTALS SHOWN AS A MONTHLY AVERAGE
        </div>
        <div style={{ fontSize: 120, fontWeight: 800, color: COLORS.ink, lineHeight: 1 }}>
          {cur.year}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 60, marginTop: 8 }}>
          <ReadOut color={vColor} label="Violent / mo (avg)" value={monthlyAvgViolent} />
          <ReadOut color={pColor} label="Property / mo (avg)" value={monthlyAvgProperty} />
        </div>
      </div>

      {/* Stacked bar chart, revealed left→right */}
      <svg
        width="1920"
        height="1080"
        viewBox="0 0 1920 1080"
        style={{ position: "absolute", inset: 0 }}
      >
        <line x1={X0 - 10} y1={BASE_Y} x2={X1 + 10} y2={BASE_Y} stroke={COLORS.grid} strokeWidth={1} />
        {years.map((yr, i) => {
          const reveal = Math.max(0, Math.min(1, yearFloat - i + 0.5));
          if (reveal <= 0) return null;
          const x = X0 + i * slot + (slot - barW) / 2;
          const propH = (yr.property / maxTotal) * BAR_H * reveal;
          const violH = (yr.violent / maxTotal) * BAR_H * reveal;
          const isCur = i === curIdx;
          return (
            <g key={yr.year} opacity={isCur ? 1 : 0.78}>
              {/* property (bottom) */}
              <rect x={x} y={BASE_Y - propH} width={barW} height={propH} fill={pColor} fillOpacity={0.85} />
              {/* violent (top) */}
              <rect x={x} y={BASE_Y - propH - violH} width={barW} height={violH} fill={vColor} fillOpacity={0.9} />
              {(yr.year % 5 === 0 || i === n - 1) && (
                <text
                  x={x + barW / 2}
                  y={BASE_Y + 22}
                  fill={COLORS.inkFaint}
                  fontSize={13}
                  fontFamily={FONT_MONO}
                  textAnchor="middle"
                >
                  {yr.year}
                </text>
              )}
              {isCur && (
                <rect x={x - 3} y={yOf(yr.total) - 3} width={barW + 6} height={BASE_Y - yOf(yr.total) + 3} fill="none" stroke="#ffffff" strokeOpacity={0.4} strokeWidth={1.5} rx={2} />
              )}
            </g>
          );
        })}
      </svg>

      {/* honest method note */}
      <div
        style={{
          position: "absolute",
          bottom: 46,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: FONT_MONO,
          fontSize: 15,
          color: COLORS.inkDim,
        }}
      >
        {history.agency} · {history.cats.violent.label.split("(")[0].trim()} &amp;{" "}
        {history.cats.property.label.split("(")[0].trim()} · these are UCR Summary counts,
        a different taxonomy than the NIBRS categories used from 2023.
      </div>
    </div>
  );
};

const ReadOut: React.FC<{ color: string; label: string; value: number }> = ({
  color,
  label,
  value,
}) => (
  <div style={{ textAlign: "center" }}>
    <div style={{ fontSize: 46, fontWeight: 700, color }}>{fmtInt(value)}</div>
    <div style={{ fontFamily: FONT_MONO, fontSize: 14, color: COLORS.inkDim }}>{label}</div>
  </div>
);

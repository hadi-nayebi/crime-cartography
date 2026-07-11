import React from "react";
import type { CatCounts } from "../data/types";
import { groupATotal } from "../data/load";
import { CAT_COLORS, COLORS, FONT_MONO } from "../theme";

interface Props {
  months: string[];
  cityMonthly: CatCounts[];
  monthFloat: number;
  /** optional reference rate (e.g. the last UCR-era monthly level) + label. */
  refRate?: number;
  refLabel?: string;
}

const X0 = 430;
const X1 = 1862;
const Y_BOTTOM = 1014;
const HEIGHT = 150;
const Y_TOP = Y_BOTTOM - HEIGHT;

// Under-map trend line. PER-MONTH Group A count — a true rate that rises and
// falls (a cumulative line would only ever climb and mislead on direction). The
// per-month unit is deliberately the SAME unit as the history era's readouts, so
// the two chapters are directly comparable; a dashed reference line marks where
// the 2022 UCR level sat, answering "how do the numbers relate?".
export const TimelineChart: React.FC<Props> = ({
  months,
  cityMonthly,
  monthFloat,
  refRate,
  refLabel,
}) => {
  const W = X1 - X0;
  const n = months.length;
  const rates = cityMonthly.map((c) => groupATotal(c)); // Group A per month
  const maxRate = Math.max(1, ...rates, refRate ?? 0);
  const axisTop = Math.ceil(maxRate / 200) * 200;

  const xOf = (m: number) => X0 + (m / n) * W;
  const yOf = (v: number) => Y_BOTTOM - (v / axisTop) * HEIGHT;

  const floor = Math.floor(monthFloat);
  const frac = monthFloat - floor;
  const curRate = rates[Math.min(n - 1, floor)] ?? 0;

  // line through completed months + the live point (no future peeking)
  const pts: [number, number][] = [];
  for (let i = 0; i <= floor && i < n; i++) pts.push([xOf(i), yOf(rates[i])]);
  if (monthFloat > 0 && floor < n) pts.push([xOf(Math.min(monthFloat, n)), yOf(curRate)]);
  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area =
    pts.length > 1
      ? `${line} L${pts[pts.length - 1][0].toFixed(1)},${Y_BOTTOM} L${pts[0][0].toFixed(1)},${Y_BOTTOM} Z`
      : "";

  const playheadX = xOf(Math.min(monthFloat, n));
  const playheadY = yOf(curRate);
  const pulse = 1 + 0.5 * Math.exp(-frac * 7);

  return (
    <svg
      width="1920"
      height="1080"
      viewBox="0 0 1920 1080"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {/* title + units */}
      <text x={X0} y={Y_TOP - 16} fill={COLORS.ink} fontSize={20} fontFamily={FONT_MONO} fontWeight={700}>
        GROUP A INCIDENTS PER MONTH
      </text>
      <text x={X0 + 370} y={Y_TOP - 16} fill={COLORS.inkFaint} fontSize={19} fontFamily={FONT_MONO}>
        — monthly rate · rises &amp; falls with the real trend (not a running total)
      </text>

      {/* y grid: 0, mid, top with value labels */}
      {[0, axisTop / 2, axisTop].map((v) => (
        <g key={v}>
          <line x1={X0} y1={yOf(v)} x2={X1} y2={yOf(v)} stroke={COLORS.grid} strokeWidth={1} />
          <text x={X0 - 10} y={yOf(v) + 4} fill={COLORS.inkFaint} fontSize={17} fontFamily={FONT_MONO} textAnchor="end">
            {Math.round(v)}
          </text>
        </g>
      ))}
      <text x={X0 - 10} y={Y_TOP - 2} fill={COLORS.inkFaint} fontSize={17} fontFamily={FONT_MONO} textAnchor="end">
        /mo
      </text>

      {/* reference line: where the old UCR era sat, same per-month unit */}
      {refRate && refRate > 0 && (
        <g>
          <line x1={X0} y1={yOf(refRate)} x2={X1} y2={yOf(refRate)} stroke={COLORS.inkDim} strokeWidth={1.4} strokeDasharray="7 6" strokeOpacity={0.7} />
          <text x={X1 - 4} y={yOf(refRate) - 7} fill={COLORS.inkDim} fontSize={17} fontFamily={FONT_MONO} textAnchor="end">
            {refLabel ?? `${Math.round(refRate)}/mo`}
          </text>
        </g>
      )}

      {/* year ticks */}
      {months.map((m, i) => {
        if (!m.endsWith("-01")) return null;
        const x = xOf(i);
        return (
          <g key={m}>
            <line x1={x} y1={Y_TOP} x2={x} y2={Y_BOTTOM} stroke={COLORS.grid} strokeWidth={1} />
            <text x={x + 4} y={Y_BOTTOM + 20} fill={COLORS.inkFaint} fontSize={17} fontFamily={FONT_MONO}>
              {m.slice(0, 4)}
            </text>
          </g>
        );
      })}

      {/* rate area + line */}
      {area && <path d={area} fill="rgba(255,46,99,0.10)" stroke="none" />}
      <path d={line} fill="none" stroke={CAT_COLORS.persons} strokeWidth={2.6} strokeLinejoin="round" />

      {/* playhead + live dot + readout */}
      {monthFloat > 0 && (
        <>
          <line x1={playheadX} y1={Y_TOP} x2={playheadX} y2={Y_BOTTOM} stroke="#ffffff" strokeOpacity={0.45} strokeWidth={1} />
          <circle cx={playheadX} cy={playheadY} r={5.5 * pulse} fill="#ffffff" />
          <circle cx={playheadX} cy={playheadY} r={5.5} fill={CAT_COLORS.persons} />
          <g transform={`translate(${Math.min(playheadX + 12, X1 - 200)}, ${Math.max(Y_TOP + 18, playheadY - 14)})`}>
            <text x={0} y={0} fill={COLORS.ink} fontSize={26} fontFamily={FONT_MONO} fontWeight={700}>
              {Math.round(curRate)}
            </text>
            <text x={0} y={22} fill={COLORS.inkDim} fontSize={17} fontFamily={FONT_MONO}>
              Group A this month
            </text>
          </g>
        </>
      )}
    </svg>
  );
};

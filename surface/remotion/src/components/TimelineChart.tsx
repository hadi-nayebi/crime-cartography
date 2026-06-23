import React from "react";
import type { CatCounts } from "../data/types";
import { cumulativeAtMonth, totalOf } from "../data/load";
import { CAT_COLORS, CATS, COLORS, FONT_MONO } from "../theme";

interface Props {
  months: string[];
  cityMonthly: CatCounts[];
  cityCumulative: CatCounts[];
  grandTotalAll: number;
  monthFloat: number;
}

const X0 = 430;
const X1 = 1862;
const Y_BOTTOM = 1018;
const HEIGHT = 132;
const Y_TOP = Y_BOTTOM - HEIGHT;

// Growing cumulative chart along the bottom — total area + per-category lines,
// moving playhead, year ticks. Same visual language as the HTML preview shell.
export const TimelineChart: React.FC<Props> = ({
  months,
  cityMonthly,
  cityCumulative,
  grandTotalAll,
  monthFloat,
}) => {
  const W = X1 - X0;
  const n = months.length;
  const xOf = (m: number) => X0 + (m / n) * W;
  const yOf = (v: number) => Y_BOTTOM - (v / grandTotalAll) * HEIGHT;

  const floor = Math.floor(monthFloat);

  // Sample a cumulative-cat accessor into a growing SVG path up to monthFloat.
  const pathFor = (pick: (c: CatCounts) => number, close: boolean) => {
    const pts: [number, number][] = [[xOf(0), yOf(0)]];
    for (let i = 0; i < n && i < floor; i++) {
      pts.push([xOf(i + 1), yOf(pick(cityCumulative[i]))]);
    }
    if (monthFloat > 0) {
      const cum = cumulativeAtMonth(cityMonthly, monthFloat);
      pts.push([xOf(monthFloat), yOf(pick(cum))]);
    }
    let d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    if (close) {
      const last = pts[pts.length - 1];
      d += ` L${last[0].toFixed(1)},${Y_BOTTOM} L${xOf(0).toFixed(1)},${Y_BOTTOM} Z`;
    }
    return d;
  };

  const playheadX = xOf(Math.min(monthFloat, n));

  return (
    <svg
      width="1920"
      height="1080"
      viewBox="0 0 1920 1080"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {/* baseline + year ticks */}
      <line x1={X0} y1={Y_BOTTOM} x2={X1} y2={Y_BOTTOM} stroke={COLORS.grid} strokeWidth={1} />
      {months.map((m, i) => {
        if (!m.endsWith("-01")) return null;
        const x = xOf(i);
        return (
          <g key={m}>
            <line x1={x} y1={Y_TOP} x2={x} y2={Y_BOTTOM} stroke={COLORS.grid} strokeWidth={1} />
            <text x={x + 4} y={Y_TOP + 14} fill={COLORS.inkFaint} fontSize={13} fontFamily={FONT_MONO}>
              {m.slice(0, 4)}
            </text>
          </g>
        );
      })}

      {/* total cumulative area */}
      <path d={pathFor(totalOf, true)} fill="rgba(231,238,247,0.07)" stroke="none" />
      <path d={pathFor(totalOf, false)} fill="none" stroke={COLORS.ink} strokeWidth={2} />

      {/* per-category cumulative lines */}
      {CATS.map((cat) => (
        <path
          key={cat}
          d={pathFor((c) => c[cat], false)}
          fill="none"
          stroke={CAT_COLORS[cat]}
          strokeWidth={1.8}
          strokeOpacity={0.9}
        />
      ))}

      {/* playhead */}
      {monthFloat > 0 && monthFloat < n && (
        <line x1={playheadX} y1={Y_TOP - 6} x2={playheadX} y2={Y_BOTTOM} stroke="#ffffff" strokeOpacity={0.5} strokeWidth={1} />
      )}
    </svg>
  );
};

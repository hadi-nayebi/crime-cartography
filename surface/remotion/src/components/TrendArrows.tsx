import React from "react";
import type { Stats } from "../data/derive";
import { beatTrend } from "../data/derive";
import type { Projection } from "../data/load";
import { FRAME } from "../theme";

interface Props {
  stats: Stats;
  projection: Projection;
  monthFloat: number;
  /** trailing window (months) compared against the prior window. */
  windowMonths: number;
  opacity: number;
}

const RISE = "#ff3b5c"; // red — getting worse
const FALL = "#36e07a"; // green — getting better
const R_MIN = 10; // px arrow half-height floor

// Per-beat direction glyph: ▲ red if this beat's trailing Group A rate is rising
// vs the prior window, ▼ green if falling. Honest comparison of two equal real
// windows — no projection. Hidden until enough history exists to compare.
export const TrendArrows: React.FC<Props> = ({
  stats,
  projection,
  monthFloat,
  windowMonths,
  opacity,
}) => {
  if (opacity <= 0.001) return null;
  // need a full prior window to compare against
  if (monthFloat < windowMonths + 0.5) return null;

  const { project } = projection;

  return (
    <svg
      width={FRAME.w}
      height={FRAME.h}
      viewBox={`0 0 ${FRAME.w} ${FRAME.h}`}
      style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
    >
      {stats.beats.map((b) => {
        const { now, prev, dir } = beatTrend(b.series, monthFloat, windowMonths);
        if (dir === 0) return null;
        // only annotate beats with meaningful activity (skip near-empty beats)
        if (Math.max(now, prev) < 6) return null;
        const [cx, cy] = project(b.centroid[0], b.centroid[1]);
        // offset up-right of centroid so it doesn't bury the dot cluster
        const ax = cx + 16;
        const ay = cy - 16;
        const color = dir === 1 ? RISE : FALL;
        // size by magnitude of change (capped)
        const change = prev > 0 ? Math.abs(now - prev) / prev : 1;
        const h = R_MIN + Math.min(8, change * 10);
        const w = h * 0.92;
        const tri =
          dir === 1
            ? `${ax},${ay - h} ${ax - w},${ay + h * 0.7} ${ax + w},${ay + h * 0.7}`
            : `${ax},${ay + h} ${ax - w},${ay - h * 0.7} ${ax + w},${ay - h * 0.7}`;
        return (
          <g key={b.key}>
            <polygon points={tri} fill={color} stroke="#06080c" strokeWidth={1.4} />
          </g>
        );
      })}
    </svg>
  );
};

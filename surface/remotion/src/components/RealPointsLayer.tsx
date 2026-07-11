import React, { useMemo } from "react";
import type { PointsFile } from "../data/types";
import type { Projection } from "../data/load";
import { CAT_COLORS, CATS } from "../theme";

interface Props {
  points: PointsFile;
  projection: Projection;
  /** fractional month index into points.months. */
  monthFloat: number;
  /** trailing window (months) a point stays visible. */
  windowMonths: number;
  opacity: number;
  emphasizeGroupA: boolean;
}

// REAL sampled incident locations (cities whose sources publish block-level
// coordinates). Unlike DotLayer (which scatters density glyphs inside a region
// when no coordinates exist), every dot here is an actual reported incident
// location, anonymized to the block by the source. Points appear in their
// month and fade over the trailing window. Purely deterministic.
export const RealPointsLayer: React.FC<Props> = ({
  points,
  projection,
  monthFloat,
  windowMonths,
  opacity,
  emphasizeGroupA,
}) => {
  // Pre-project every point once; per-frame work is only windowing + fade.
  // (Hook must run unconditionally — early return comes after.)
  const projected = useMemo(
    () =>
      points.pts.map((month) =>
        month.map(([lng, lat, ci]) => {
          const [x, y] = projection.project(lng, lat);
          return [x, y, ci] as const;
        }),
      ),
    [points, projection],
  );
  if (opacity <= 0.001) return null;

  const lo = Math.max(0, Math.floor(monthFloat - windowMonths));
  const hi = Math.min(projected.length - 1, Math.floor(monthFloat));

  const nodes: React.ReactNode[] = [];
  for (let mi = lo; mi <= hi; mi++) {
    // age 0 = newest month, 1 = oldest edge of the window
    const age = Math.max(0, Math.min(1, (monthFloat - mi) / windowMonths));
    // newest month blooms in with its fractional progress
    const bloom = mi === Math.floor(monthFloat) ? Math.min(1, (monthFloat - mi) * 3) : 1;
    const monthOpacity = (1 - age * 0.75) * bloom;
    if (monthOpacity <= 0.01) continue;
    for (let i = 0; i < projected[mi].length; i++) {
      const [x, y, ci] = projected[mi][i];
      const cat = CATS[ci] ?? "other";
      if (emphasizeGroupA && cat === "other") continue;
      nodes.push(
        <circle
          key={`${mi}-${i}`}
          cx={x}
          cy={y}
          r={2.6}
          fill={CAT_COLORS[cat]}
          opacity={monthOpacity * 0.85}
        />,
      );
    }
  }

  return (
    <svg
      width="1920"
      height="1080"
      viewBox="0 0 1920 1080"
      style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
    >
      {nodes}
    </svg>
  );
};

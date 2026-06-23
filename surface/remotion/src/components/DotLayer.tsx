import React, { useMemo } from "react";
import type { Stats } from "../data/derive";
import {
  windowCountAtMonth,
  type Projection,
} from "../data/load";
import { sampleDotsInBeat, makeDotCategories, groupAOf } from "../data/dots";
import type { Beat } from "../data/types";
import { CAT_COLORS, FRAME } from "../theme";

interface Props {
  beatsByKey: Record<string, Beat>;
  stats: Stats;
  projection: Projection;
  monthFloat: number;
  /** how many real months the dot window spans */
  windowMonths: number;
  /** incidents represented by one dot */
  perDot: number;
  /** 0..1 master opacity (era-2 gated) */
  opacity: number;
}

const MAX_DOTS = 120;

interface BeatDots {
  key: string;
  pts: [number, number][];
  cats: ("persons" | "property" | "society")[];
  series: Stats["beats"][number]["series"];
}

// Count-accurate dot density. Dots are sampled WITHIN each beat polygon (not
// geolocated) and revealed in proportion to the beat's trailing-window Group A
// count. Disclosed on screen as density, not location.
export const DotLayer: React.FC<Props> = ({
  beatsByKey,
  stats,
  projection,
  monthFloat,
  windowMonths,
  perDot,
  opacity,
}) => {
  // Precompute the dot pool + stable category per slot, once.
  const pools = useMemo<BeatDots[]>(() => {
    return stats.beats.map((b) => {
      const beat = beatsByKey[b.key];
      const pts = beat ? sampleDotsInBeat(beat, MAX_DOTS) : [];
      const cats = makeDotCategories(pts.length, {
        persons: b.catTotalsAll.persons,
        property: b.catTotalsAll.property,
        society: b.catTotalsAll.society,
      });
      return { key: b.key, pts, cats, series: b.series };
    });
  }, [stats, beatsByKey]);

  if (opacity <= 0.001) return null;
  const { project } = projection;

  return (
    <svg
      width={FRAME.w}
      height={FRAME.h}
      viewBox={`0 0 ${FRAME.w} ${FRAME.h}`}
      style={{ position: "absolute", inset: 0, opacity }}
    >
      {pools.map((bd) => {
        const w = windowCountAtMonth(bd.series, monthFloat, windowMonths);
        const nFloat = groupAOf(w) / perDot;
        const nShow = Math.min(bd.pts.length, Math.ceil(nFloat));
        const nodes = [];
        for (let i = 0; i < nShow; i++) {
          const edge = Math.max(0, Math.min(1, nFloat - i));
          if (edge <= 0.02) continue;
          const [lng, lat] = bd.pts[i];
          const [cx, cy] = project(lng, lat);
          const r = (2.5 + (i % 3) * 0.5) * (0.6 + 0.4 * edge);
          nodes.push(
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill={CAT_COLORS[bd.cats[i]]}
              fillOpacity={0.85 * edge}
            />,
          );
        }
        return <g key={bd.key}>{nodes}</g>;
      })}
    </svg>
  );
};

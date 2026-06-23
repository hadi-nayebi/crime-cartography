import React from "react";
import type { Bundle } from "../data/types";
import type { Stats } from "../data/derive";
import { beatMetric } from "../data/derive";
import {
  makeProjection,
  polygonToPath,
  windowCountAtMonth,
  dominantCat,
  type Projection,
} from "../data/load";
import { CAT_COLORS, COLORS, FRAME } from "../theme";

interface Props {
  bundle: Bundle;
  projection: Projection;
  stats: Stats;
  monthFloat: number;
  windowMonths: number;
  emphasizeGroupA: boolean;
  /** 0..1 reveal of the polygons themselves (cold-open fade-in). */
  mapOpacity: number;
  /** 0..1 master opacity for heat (choropleth + symbols). */
  heatOpacity: number;
  /** show the per-beat centroid symbols (false when DotLayer takes over). */
  showSymbols?: boolean;
}

const R_MAX = 46; // px — largest centroid symbol radius
const R_MIN = 3;

export const MapLayer: React.FC<Props> = ({
  bundle,
  projection,
  stats,
  monthFloat,
  windowMonths,
  emphasizeGroupA,
  mapOpacity,
  heatOpacity,
  showSymbols = true,
}) => {
  const { project } = projection;
  const frac = monthFloat - Math.floor(monthFloat);
  // brief pulse right after a month ticks over
  const pulse = Math.exp(-frac * 7);

  return (
    <svg
      width={FRAME.w}
      height={FRAME.h}
      viewBox={`0 0 ${FRAME.w} ${FRAME.h}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        {Object.entries(CAT_COLORS).map(([cat, color]) => (
          <radialGradient id={`glow-${cat}`} key={cat}>
            <stop offset="0%" stopColor={color} stopOpacity={0.95} />
            <stop offset="45%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>

      {/* Choropleth polygons — fill intensity = trailing-window rate */}
      <g style={{ opacity: mapOpacity }}>
        {Object.values(bundle.beats.beats).map((beat) => {
          const series = bundle.timeline.cells[beat.key];
          const d = polygonToPath(beat, project);
          if (!series) {
            return (
              <path
                key={beat.key}
                d={d}
                fill={COLORS.beatFill}
                stroke={COLORS.beatStroke}
                strokeWidth={1}
              />
            );
          }
          const w = windowCountAtMonth(series, monthFloat, windowMonths);
          const metric = beatMetric(w, emphasizeGroupA);
          const intensity = Math.min(1, metric / stats.maxWindowMetric);
          const cat = dominantCat(w, emphasizeGroupA);
          const fillAlpha = 0.06 + intensity * 0.5 * heatOpacity;
          return (
            <path
              key={beat.key}
              d={d}
              fill={CAT_COLORS[cat]}
              fillOpacity={fillAlpha}
              stroke={COLORS.beatStroke}
              strokeWidth={1}
            />
          );
        })}
      </g>

      {/* Proportional glowing symbols at real beat centroids */}
      <g style={{ opacity: heatOpacity, display: showSymbols ? undefined : "none" }}>
        {stats.beats.map((b) => {
          const w = windowCountAtMonth(b.series, monthFloat, windowMonths);
          const metric = beatMetric(w, emphasizeGroupA);
          if (metric <= 0) return null;
          const cat = dominantCat(w, emphasizeGroupA);
          const norm = Math.sqrt(metric / stats.maxWindowMetric);
          const r = (R_MIN + norm * (R_MAX - R_MIN)) * (1 + pulse * 0.12);
          const [cx, cy] = project(b.centroid[0], b.centroid[1]);
          return (
            <g key={b.key}>
              <circle
                cx={cx}
                cy={cy}
                r={r * 1.9}
                fill={`url(#glow-${cat})`}
                opacity={0.55}
              />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={CAT_COLORS[cat]}
                fillOpacity={0.8}
                stroke="#ffffff"
                strokeOpacity={0.25}
                strokeWidth={1}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

// Helper so the story can build the projection once (full-frame backdrop with
// generous margins so floating panels don't crowd the centroids).
export function buildMapProjection(bundle: Bundle): Projection {
  return makeProjection(
    bundle.beats,
    { x: 430, y: 70, w: 1060, h: 940 },
    24,
  );
}

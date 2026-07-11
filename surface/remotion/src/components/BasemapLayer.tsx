import React, { useMemo } from "react";
import type { BasemapFile } from "../data/types";
import type { Projection } from "../data/load";
import { COLORS, FONT_MONO } from "../theme";

interface Props {
  basemap: BasemapFile;
  projection: Projection;
  opacity: number;
  /** landmark labels fade in slightly after the roads. */
  labelOpacity?: number;
}

const KIND_GLYPH: Record<string, string> = {
  airport: "✈",
  terminal: "▣",
  stadium: "◆",
  university: "✦",
  landmark: "★",
};

// Orientation layer: major highways + well-known landmarks (both REAL OSM
// geometry — © OpenStreetMap contributors, credited on screen). Sits above the
// choropleth, below the incident dots, so a viewer can instantly tell where in
// the city they're looking.
export const BasemapLayer: React.FC<Props> = ({ basemap, projection, opacity, labelOpacity }) => {
  // project all highway segments once
  const roads = useMemo(
    () =>
      basemap.highways.map((h) => ({
        ref: h.ref,
        paths: h.segs.map((seg) =>
          seg
            .map(([lng, lat], i) => {
              const [x, y] = projection.project(lng, lat);
              return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" "),
        ),
      })),
    [basemap, projection],
  );
  const marks = useMemo(() => {
    const ms = basemap.landmarks.map((l) => {
      const [x, y] = projection.project(l.lng, l.lat);
      return { ...l, x, y, labelSide: 1, dy: 0 };
    });
    // simple de-collision: sort by y; when two labels would stack (<26px apart
    // vertically and horizontally near), flip the later one to the left side,
    // and if still crowded push it down a line.
    ms.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ms.length; i++) {
      for (let j = 0; j < i; j++) {
        const dy = Math.abs(ms[i].y + ms[i].dy - (ms[j].y + ms[j].dy));
        const dx = Math.abs(ms[i].x - ms[j].x);
        if (dy < 26 && dx < 300) {
          if (ms[j].labelSide === 1 && ms[i].labelSide === 1) ms[i].labelSide = -1;
          else ms[i].dy += 26;
        }
      }
    }
    return ms;
  }, [basemap, projection]);
  if (opacity <= 0.001) return null;
  const lblO = (labelOpacity ?? opacity) * 0.95;

  // shields only for clean interstate refs — anything else is clutter
  const shieldFor = (ref: string) => /^I[- ]?\d+$/.test(ref.trim());

  return (
    <svg
      width="1920"
      height="1080"
      viewBox="0 0 1920 1080"
      style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
    >
      {/* highways */}
      {roads.map((r, ri) =>
        r.paths.map((d, si) => (
          <path
            key={`${ri}-${si}`}
            d={d}
            fill="none"
            stroke="#c9d6e6"
            strokeOpacity={0.22}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        )),
      )}
      {/* one small route shield per named interstate/US route */}
      {roads
        .filter((r) => shieldFor(r.ref))
        .map((r, i) => {
          // anchor at the midpoint of the longest segment
          const longest = r.paths.reduce((a, b) => (b.length > a.length ? b : a), "");
          const coords = longest.match(/[ML]([\d.]+),([\d.]+)/g) ?? [];
          if (!coords.length) return null;
          const mid = coords[Math.floor(coords.length / 2)];
          const m = mid.match(/[ML]([\d.]+),([\d.]+)/);
          if (!m) return null;
          const x = Number(m[1]);
          const y = Number(m[2]);
          if (x < 30 || x > 1890 || y < 30 || y > 1050) return null;
          return (
            <g key={`sh${i}`} opacity={lblO * 0.9}>
              <rect x={x - 27} y={y - 13} width={54} height={26} rx={5} fill="rgba(8,11,16,0.85)" stroke="rgba(201,214,230,0.35)" strokeWidth={0.8} />
              <text x={x} y={y + 5} fill="#c9d6e6" fontSize={15} fontFamily={FONT_MONO} textAnchor="middle">
                {r.ref}
              </text>
            </g>
          );
        })}
      {/* landmarks (labels de-collided: side flips + line pushes) */}
      {marks.map((l, i) => (
        <g key={i} opacity={lblO}>
          <circle cx={l.x} cy={l.y} r={4.5} fill="#ffffff" fillOpacity={0.9} stroke="rgba(0,0,0,0.7)" strokeWidth={1.4} />
          <text
            x={l.x + 12 * l.labelSide}
            y={l.y + 5 + l.dy}
            fill={COLORS.ink}
            fontSize={19}
            fontFamily={FONT_MONO}
            fontWeight={700}
            textAnchor={l.labelSide === 1 ? "start" : "end"}
            paintOrder="stroke"
            stroke="rgba(4,6,10,0.9)"
            strokeWidth={3.5}
          >
            {`${KIND_GLYPH[l.kind] ?? "•"} ${l.name.replace(/\s*✈\s*/g, "")}`}
          </text>
        </g>
      ))}
    </svg>
  );
};

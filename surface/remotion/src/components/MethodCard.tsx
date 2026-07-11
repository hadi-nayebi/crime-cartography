import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import type { HistoryFile, Summary, TrendFile } from "../data/types";
import { fmtInt } from "../data/derive";
import { CAT_COLORS, CAT_LABELS, CATS, COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Props {
  summary: Summary;
  history: HistoryFile | null;
  /** full long-arc series — preferred over history for the box-01 preview. */
  trend?: TrendFile | null;
  durationInFrames: number;
  /** city-specific copy overrides (config.copy); neutral defaults otherwise. */
  recentTag?: string; // box-02 chip, e.g. "GRPD NIBRS"
  recentSub?: string; // box-02 subtitle
  dotsHeadline?: string; // box-03 headline (density vs real locations)
  dotsSub?: string; // box-03 subtitle
  footnote?: string; // taxonomy caveat line under the legend
}

// Eased 0→1 reveal starting at `delay` frames (used to cascade boxes L→R).
function revealAt(delay: number, frame: number) {
  return interpolate(frame, [delay, delay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
}

// Small trend sparkline drawn from REAL annual totals (full arc preferred).
const Sparkline: React.FC<{ totals: number[]; t: number }> = ({ totals, t }) => {
  const W = 372;
  const H = 128;
  if (totals.length < 2) return <div style={{ height: H }} />;
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  const span = max - min || 1;
  const pts = totals.map((v, i) => {
    const x = (i / (totals.length - 1)) * W;
    const y = H - 8 - ((v - min) / span) * (H - 20);
    return [x, y] as const;
  });
  // Animate the line drawing L→R with the box reveal.
  const shown = Math.max(2, Math.round(pts.length * t));
  const vis = pts.slice(0, shown);
  const line = vis.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${vis[vis.length - 1][0].toFixed(1)},${H} L0,${H} Z`;
  const head = vis[vis.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="mc-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CAT_COLORS.property} stopOpacity="0.28" />
          <stop offset="1" stopColor={CAT_COLORS.property} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mc-spark)" />
      <path d={line} fill="none" stroke={COLORS.ink} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={head[0]} cy={head[1]} r={4} fill={CAT_COLORS.persons} />
    </svg>
  );
};

// Mini neighborhood heat-grid — previews the recent per-beat choropleth idea.
const HeatGrid: React.FC<{ t: number }> = ({ t }) => {
  // Fixed intensities (0..1) — an illustrative grid of "neighborhoods", not data.
  const cells = [0.85, 0.35, 0.6, 0.2, 0.95, 0.45, 0.3, 0.7, 0.5, 0.25, 0.8, 0.4];
  const cols = 4;
  const gap = 8;
  const size = 84;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, ${size}px)`,
        gap,
        justifyContent: "center",
      }}
    >
      {cells.map((v, i) => {
        const cellT = interpolate(t, [i / cells.length, 1], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={i}
            style={{
              width: size,
              height: 28,
              borderRadius: 5,
              background: CAT_COLORS.persons,
              opacity: (0.14 + v * 0.72) * cellT,
              border: `1px solid rgba(125,145,175,0.18)`,
            }}
          />
        );
      })}
    </div>
  );
};

// Dots-in-a-beat — previews the "density, not location" disclosure.
const DensityGlyph: React.FC<{ t: number }> = ({ t }) => {
  // Deterministic scatter (no Math.random — Remotion must stay pure).
  const dots: Array<[number, number, keyof typeof CAT_COLORS]> = [
    [0.2, 0.3, "persons"], [0.5, 0.2, "property"], [0.75, 0.35, "society"],
    [0.32, 0.55, "property"], [0.6, 0.5, "persons"], [0.82, 0.62, "property"],
    [0.18, 0.72, "society"], [0.45, 0.78, "persons"], [0.68, 0.75, "property"],
    [0.5, 0.45, "persons"], [0.28, 0.42, "property"], [0.72, 0.28, "persons"],
  ];
  const W = 372;
  const H = 128;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <rect
        x={40}
        y={10}
        width={W - 80}
        height={H - 20}
        rx={12}
        fill={COLORS.beatFill}
        stroke={COLORS.beatStroke}
        strokeWidth={1.5}
      />
      {dots.map(([fx, fy, cat], i) => {
        const cellT = interpolate(t, [i / dots.length, 1], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <circle
            key={i}
            cx={40 + fx * (W - 80)}
            cy={10 + fy * (H - 20)}
            r={4.5 * cellT}
            fill={CAT_COLORS[cat]}
            opacity={0.9}
          />
        );
      })}
    </svg>
  );
};

interface Card {
  index: string;
  tag: string;
  headline: string;
  sub: string;
  visual: React.ReactNode;
}

// One-time honesty + roadmap card. Instead of a wall of text, it shows three
// boxes that reveal left→right, each previewing one thing the video does:
// the long trend, the recent neighborhood heat map, and the "dots = density,
// not location" disclosure. Facts (span, coverage, taxonomy) become tags/chips.
export const MethodCard: React.FC<Props> = ({
  summary,
  history,
  trend,
  durationInFrames,
  recentTag,
  recentSub,
  dotsHeadline,
  dotsSub,
  footnote,
}) => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [durationInFrames - 22, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const arcTotals = trend
    ? trend.years.map((y) => y.total)
    : (history?.years ?? []).map((y) => y.total);
  const yMin = trend
    ? trend.years[0].year
    : history
      ? history.yearMin
      : Number(summary.dateMin.slice(0, 4));
  const yMax = trend
    ? trend.years[trend.years.length - 1].year
    : history
      ? history.yearMax
      : Number(summary.dateMax.slice(0, 4));
  const startYear = summary.dateMin.slice(0, 4);
  const endYear = summary.dateMax.slice(0, 4);

  const cards: Card[] = [
    {
      index: "01",
      tag: "FBI UCR",
      headline: "The long arc",
      sub: `${yMin}–${yMax} · reported crimes per year — how they rose and fell`,
      visual: null, // filled below (needs per-card reveal t)
    },
    {
      index: "02",
      tag: recentTag ?? "CITY DATA",
      headline: "The map comes alive",
      sub: recentSub ?? `${startYear}–${endYear} · per neighborhood, month by month`,
      visual: null,
    },
    {
      index: "03",
      tag: "HONEST",
      headline: dotsHeadline ?? "How many, not where",
      sub:
        dotsSub ??
        `${summary.coveragePct}% mapped to ${summary.beatCount} districts — the rest counted, disclosed, never invented`,
      visual: null,
    },
  ];

  const CARD_W = 420;
  const GAP = 40;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut,
        background: "rgba(4,6,9,0.72)",
        fontFamily: FONT_SANS,
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          opacity: revealAt(0, frame),
          fontFamily: FONT_MONO,
          fontSize: 20,
          letterSpacing: 6,
          color: COLORS.inkFaint,
          marginBottom: 34,
        }}
      >
        WHAT YOU’RE ABOUT TO SEE
      </div>

      {/* Row of boxes, cascading in from the left */}
      <div style={{ display: "flex", gap: GAP }}>
        {cards.map((c, i) => {
          const t = revealAt(10 + i * 12, frame);
          const visual =
            i === 0 ? <Sparkline totals={arcTotals} t={t} /> : i === 1 ? <HeatGrid t={t} /> : <DensityGlyph t={t} />;
          return (
            <div
              key={c.index}
              style={{
                width: CARD_W,
                opacity: t,
                transform: `translateX(${(1 - t) * -70}px)`,
                padding: "26px 28px 30px",
                borderRadius: 18,
                background: "rgba(10,13,19,0.94)",
                border: `1px solid ${COLORS.panelStroke}`,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 26, fontWeight: 700, color: COLORS.inkFaint }}>
                  {c.index}
                </span>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 17,
                    letterSpacing: 2,
                    color: COLORS.inkDim,
                    border: `1px solid ${COLORS.panelStroke}`,
                    borderRadius: 20,
                    padding: "4px 12px",
                  }}
                >
                  {c.tag}
                </span>
              </div>

              <div
                style={{
                  height: 132,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                {visual}
              </div>

              <div style={{ fontSize: 28, fontWeight: 600, color: COLORS.ink, marginBottom: 8 }}>{c.headline}</div>
              <div style={{ fontSize: 20, lineHeight: 1.45, color: COLORS.inkDim }}>{c.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Bottom strip: category legend + the taxonomy honesty note */}
      <div
        style={{
          opacity: revealAt(58, frame),
          marginTop: 38,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 30, flexWrap: "wrap", justifyContent: "center" }}>
          {CATS.map((cat) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 13, height: 13, borderRadius: 7, background: CAT_COLORS[cat] }} />
              <span style={{ fontSize: 20, color: COLORS.inkDim }}>
                {CAT_LABELS[cat]} · {fmtInt(summary.catTotals[cat])}
              </span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 18, color: COLORS.inkFaint, fontFamily: FONT_MONO, letterSpacing: 0.5 }}>
          {footnote ??
            `FBI UCR (through ${yMax}) and the city's incident data (${startYear}+) are different measures — shown as two chapters, not one line.`}
        </div>
      </div>
    </div>
  );
};

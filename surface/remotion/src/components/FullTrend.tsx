import React from "react";
import { interpolate, Easing } from "remotion";
import type { TrendFile } from "../data/types";
import { fmtInt } from "../data/derive";
import { CAT_COLORS, COLORS, FONT_MONO, FONT_SANS } from "../theme";

export type TrendStyle = "bars" | "area" | "lollipop" | "steps" | "stacked";

interface Props {
  trend: TrendFile;
  /** 0..N years elapsed across the whole trend span (fractional). */
  yearFloat: number;
  opacity: number;
  style?: TrendStyle;
  /** accent for the incident era (city color); fbi era renders desaturated. */
  accent?: string;
  kicker?: string;
  /** verified net-change punchline shown once the reveal completes. */
  punchline?: { text: string; sub: string };
  /** why-the-jump explainer shown while the sweep crosses the seam
      (config copy.seamExplain overrides the engine default). */
  seamExplain?: string;
}

const X0 = 300;
const X1 = 1620;
const BASE_Y = 800;
const CHART_H = 400;
const FBI_COLOR = "#6b7f96"; // desaturated steel for the UCR era (same across cities)

// Chapter 1 — THE LONG ARC, always running to the last complete year.
// Two real measures joined with an EXPLICIT seam (labeled measure change):
// FBI UCR (Violent+Property) then the city's own incident data. Bars/area/
// lollipop style is a per-city config choice so published videos differ.
export const FullTrend: React.FC<Props> = ({
  trend,
  yearFloat,
  opacity,
  style = "bars",
  accent = "#ffb020",
  kicker,
  punchline,
  seamExplain,
}) => {
  const years = trend.years;
  const n = years.length;
  const maxTotal = Math.max(...years.map((y) => y.total));
  const W = X1 - X0;
  const slot = W / n;
  const curIdx = Math.max(0, Math.min(n - 1, Math.floor(yearFloat)));
  const cur = years[curIdx];
  const curEra = trend.eras.find((e) => e.key === cur.era);
  const seamIdx = years.findIndex((y) => y.year === trend.seamYear);
  const yOf = (v: number) => BASE_Y - (v / maxTotal) * CHART_H;
  const colorOf = (era: string) => (era === "fbi" ? FBI_COLOR : accent);

  // punchline appears once the sweep is essentially complete
  const punchT = interpolate(yearFloat, [n - 1.5, n - 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <div style={{ position: "absolute", inset: 0, opacity, fontFamily: FONT_SANS }}>
      {/* Header: kicker + big year + readout */}
      <div style={{ position: "absolute", top: 64, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 19, letterSpacing: 5, color: COLORS.inkFaint }}>
          {kicker ??
            `THE LONG ARC · ${years[0].year}–${years[n - 1].year} · REPORTED CRIMES PER YEAR`}
        </div>
        <div style={{ fontSize: 112, fontWeight: 800, color: COLORS.ink, lineHeight: 1 }}>{cur.year}</div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 18, marginTop: 4 }}>
          <span style={{ fontSize: 52, fontWeight: 700, color: colorOf(cur.era) }}>{fmtInt(cur.total)}</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 21, color: COLORS.inkDim }}>
            reports this year · {curEra?.label}
          </span>
        </div>
      </div>

      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        {/* y gridlines */}
        {[maxTotal, maxTotal / 2].map((v) => (
          <g key={v}>
            <line x1={X0 - 10} y1={yOf(v)} x2={X1 + 10} y2={yOf(v)} stroke={COLORS.grid} strokeWidth={1} strokeDasharray="4 6" />
            <text x={X0 - 16} y={yOf(v) + 4} fill={COLORS.inkFaint} fontSize={17} fontFamily={FONT_MONO} textAnchor="end">
              {fmtInt(v)}
            </text>
          </g>
        ))}
        <text x={X0 - 16} y={yOf(maxTotal) - 12} fill={COLORS.inkFaint} fontSize={17} fontFamily={FONT_MONO} textAnchor="end">
          reports/yr
        </text>
        <line x1={X0 - 10} y1={BASE_Y} x2={X1 + 10} y2={BASE_Y} stroke={COLORS.grid} strokeWidth={1} />

        {/* series, revealed left→right */}
        {style === "area" ? (
          <AreaSeries years={years} yearFloat={yearFloat} yOf={yOf} slot={slot} colorOf={colorOf} seamIdx={seamIdx} />
        ) : style === "steps" ? (
          <StepSeries years={years} yearFloat={yearFloat} yOf={yOf} slot={slot} colorOf={colorOf} />
        ) : style === "stacked" ? (
          <StackedSeries years={years} yearFloat={yearFloat} maxTotal={maxTotal} slot={slot} colorOf={colorOf} curIdx={curIdx} />
        ) : (
          years.map((yr, i) => {
            const reveal = Math.max(0, Math.min(1, yearFloat - i + 0.5));
            if (reveal <= 0) return null;
            const cx = X0 + i * slot + slot / 2;
            const h = (yr.total / maxTotal) * CHART_H * reveal;
            const c = colorOf(yr.era);
            const isCur = i === curIdx;
            return (
              <g key={yr.year} opacity={isCur ? 1 : 0.8}>
                {style === "lollipop" ? (
                  <>
                    <line x1={cx} y1={BASE_Y} x2={cx} y2={BASE_Y - h} stroke={c} strokeWidth={Math.min(5, slot * 0.28)} strokeOpacity={0.75} />
                    <circle cx={cx} cy={BASE_Y - h} r={Math.min(7, slot * 0.4)} fill={c} />
                  </>
                ) : (
                  <rect x={cx - slot * 0.31} y={BASE_Y - h} width={slot * 0.62} height={h} fill={c} fillOpacity={0.88} />
                )}
                {(yr.year % 5 === 0 || i === n - 1) && (
                  <text x={cx} y={BASE_Y + 24} fill={COLORS.inkFaint} fontSize={17} fontFamily={FONT_MONO} textAnchor="middle">
                    {yr.year}
                  </text>
                )}
                {isCur && (
                  <circle cx={cx} cy={BASE_Y - h - (style === "lollipop" ? 14 : 8)} r={4} fill={COLORS.ink} />
                )}
              </g>
            );
          })
        )}

        {/* SEAM — explicit measure change */}
        {seamIdx > 0 && yearFloat > seamIdx - 2 && (
          <g
            opacity={
              interpolate(yearFloat, [seamIdx - 2, seamIdx], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) *
              (1 - punchT * 0.85) /* yield to the punchline card */
            }
          >
            <line
              x1={X0 + seamIdx * slot}
              y1={yOf(maxTotal) - 26}
              x2={X0 + seamIdx * slot}
              y2={BASE_Y + 8}
              stroke={COLORS.ink}
              strokeOpacity={0.45}
              strokeWidth={1.5}
              strokeDasharray="7 5"
            />
            <text
              x={X0 + seamIdx * slot}
              y={yOf(maxTotal) - 34}
              fill={COLORS.inkDim}
              fontSize={18}
              fontFamily={FONT_MONO}
              textAnchor="middle"
            >
              {trend.seamYear} · the measure changes
            </text>
          </g>
        )}
      </svg>

      {/* era legend chips */}
      <div style={{ position: "absolute", top: BASE_Y + 40, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 34 }}>
        {trend.eras.map((e) => (
          <div key={e.key} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 13, height: 13, borderRadius: 3, background: colorOf(e.key) }} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 19, color: COLORS.inkDim }}>
              {e.from}–{e.to} · {e.label}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          top: BASE_Y + 74,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: FONT_MONO,
          fontSize: 18,
          color: COLORS.inkFaint,
        }}
      >
        two different counting systems — compare the shape within each era, not across the dashed seam
      </div>

      {/* WHY-THE-JUMP seam explainer — rides the sweep across the measure
          change, answering "why did the value jump / did classification
          change?" the moment a viewer would ask it. */}
      {seamIdx > 0 && (() => {
        const t = Math.min(
          interpolate(yearFloat, [seamIdx - 0.3, seamIdx + 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          interpolate(yearFloat, [seamIdx + 3.6, seamIdx + 4.6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        );
        if (t <= 0.01) return null;
        const seamX = X0 + seamIdx * slot;
        const cardW = 480;
        const left = seamX > (X0 + X1) / 2 ? seamX - cardW - 36 : seamX + 36;
        const text =
          seamExplain ??
          `The ruler changes here — not the city. Until ${trend.seamYear - 1} the gray bars count only the FBI's classic “index” crimes (murder, robbery, assault, burglary, theft…). From ${trend.seamYear} the ${trend.eras[1].label.split("—")[0].trim()} figures count under a newer, broader incident-based system, so levels can jump. Compare shapes within one color, never across the line.`;
        return (
          <div
            style={{
              position: "absolute",
              left,
              top: 396,
              width: cardW,
              opacity: t,
              transform: `translateY(${(1 - t) * 16}px)`,
              background: "rgba(8,11,16,0.94)",
              border: `1px solid ${COLORS.panelStroke}`,
              borderLeft: `4px solid ${accent}`,
              borderRadius: 12,
              padding: "14px 18px",
              boxShadow: "0 14px 44px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontFamily: FONT_MONO, fontSize: 15, letterSpacing: 3, color: accent, marginBottom: 6 }}>
              WHY THE JUMP?
            </div>
            <div style={{ fontSize: 19, lineHeight: 1.45, color: COLORS.ink, fontWeight: 500 }}>{text}</div>
          </div>
        );
      })()}

      {/* Net-change punchline (verified, from config) */}
      {punchline && punchT > 0.01 && (
        <div
          style={{
            position: "absolute",
            top: 318,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            opacity: punchT,
            transform: `translateY(${(1 - punchT) * 26}px)`,
          }}
        >
          <div
            style={{
              background: "rgba(8,11,16,0.92)",
              border: `1px solid ${accent}88`,
              borderRadius: 16,
              padding: "18px 34px",
              textAlign: "center",
              boxShadow: "0 18px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: 46, fontWeight: 800, color: accent }}>{punchline.text}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 20, color: COLORS.inkDim, marginTop: 6 }}>
              {punchline.sub}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Step-line rendering: horizontal treads + vertical risers, per era (seam = hard break).
const StepSeries: React.FC<{
  years: TrendFile["years"];
  yearFloat: number;
  yOf: (v: number) => number;
  slot: number;
  colorOf: (era: string) => string;
}> = ({ years, yearFloat, yOf, slot, colorOf }) => {
  const shown = Math.max(1, Math.min(years.length, yearFloat + 0.5));
  const segs: Array<{ era: string; d: string; lastX: number; lastY: number }> = [];
  for (let i = 0; i < shown; i++) {
    const frac = Math.max(0, Math.min(1, shown - i));
    const x0 = X0 + i * slot;
    const x1 = x0 + slot * Math.min(1, frac);
    const y = BASE_Y - (BASE_Y - yOf(years[i].total)) * Math.min(1, frac * 2);
    const era = years[i].era;
    let seg = segs[segs.length - 1];
    if (!seg || seg.era !== era) {
      seg = { era, d: `M${x0.toFixed(1)},${y.toFixed(1)}`, lastX: x0, lastY: y };
      segs.push(seg);
    } else {
      seg.d += ` L${x0.toFixed(1)},${y.toFixed(1)}`; // riser
    }
    seg.d += ` L${x1.toFixed(1)},${y.toFixed(1)}`; // tread
    seg.lastX = x1; seg.lastY = y;
  }
  return (
    <>
      {segs.map((s, si) => (
        <g key={si}>
          <path
            d={`${s.d} L${s.lastX.toFixed(1)},${BASE_Y} L${s.d.slice(1).split(",")[0]},${BASE_Y} Z`}
            fill={colorOf(s.era)}
            fillOpacity={0.14}
          />
          <path d={s.d} fill="none" stroke={colorOf(s.era)} strokeWidth={3.5} strokeLinejoin="round" />
        </g>
      ))}
      {years.map((yr, i) =>
        yr.year % 5 === 0 || i === years.length - 1 ? (
          <text key={yr.year} x={X0 + i * slot + slot / 2} y={BASE_Y + 24} fill={COLORS.inkFaint}
            fontSize={17} fontFamily={FONT_MONO} textAnchor="middle" opacity={i < shown ? 1 : 0}>
            {yr.year}
          </text>
        ) : null,
      )}
    </>
  );
};

// Stacked composition bars — shows WHAT kind of crime changed. Uses yr.parts
// (validated to sum exactly to the total). FBI era: violent over property in
// two steels; incident era: per-category city colors. Falls back to solid bars
// where parts are absent.
const FBI_PART_COLORS: Record<string, string> = { violent: "#8b97ab", property: "#55677d" };
const StackedSeries: React.FC<{
  years: TrendFile["years"];
  yearFloat: number;
  maxTotal: number;
  slot: number;
  colorOf: (era: string) => string;
  curIdx: number;
}> = ({ years, yearFloat, maxTotal, slot, colorOf, curIdx }) => {
  const order = ["property", "other", "society", "violent", "persons"]; // big buckets at the base
  return (
    <>
      {years.map((yr, i) => {
        const reveal = Math.max(0, Math.min(1, yearFloat - i + 0.5));
        if (reveal <= 0) return null;
        const cx = X0 + i * slot + slot / 2;
        const w = slot * 0.62;
        const scale = (v: number) => (v / maxTotal) * CHART_H * reveal;
        let yCursor = BASE_Y;
        const parts = yr.parts
          ? order.filter((k) => yr.parts![k] > 0).map((k) => [k, yr.parts![k]] as const)
          : [["total", yr.total] as const];
        return (
          <g key={yr.year} opacity={i === curIdx ? 1 : 0.8}>
            {parts.map(([k, v]) => {
              const h = scale(v);
              yCursor -= h;
              const fill =
                k === "total" ? colorOf(yr.era)
                : yr.era === "fbi" ? (FBI_PART_COLORS[k] ?? colorOf("fbi"))
                : (CAT_COLORS[k] ?? colorOf(yr.era));
              return <rect key={k} x={cx - w / 2} y={yCursor} width={w} height={h} fill={fill} fillOpacity={0.9} />;
            })}
            {(yr.year % 5 === 0 || i === years.length - 1) && (
              <text x={cx} y={BASE_Y + 24} fill={COLORS.inkFaint} fontSize={17} fontFamily={FONT_MONO} textAnchor="middle">
                {yr.year}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
};

// Progressive filled-area rendering (per era, so the seam stays a hard break).
const AreaSeries: React.FC<{
  years: TrendFile["years"];
  yearFloat: number;
  yOf: (v: number) => number;
  slot: number;
  colorOf: (era: string) => string;
  seamIdx: number;
}> = ({ years, yearFloat, yOf, slot, colorOf, seamIdx }) => {
  const shown = Math.max(1, Math.min(years.length, yearFloat + 0.5));
  const segs: Array<{ era: string; pts: Array<[number, number]> }> = [];
  for (let i = 0; i < shown; i++) {
    const frac = Math.max(0, Math.min(1, shown - i));
    const x = X0 + i * slot + slot / 2;
    const y = BASE_Y - (BASE_Y - yOf(years[i].total)) * frac;
    const era = years[i].era;
    if (!segs.length || segs[segs.length - 1].era !== era) segs.push({ era, pts: [] });
    segs[segs.length - 1].pts.push([x, y]);
  }
  return (
    <>
      {segs.map((s, si) => {
        if (s.pts.length < 2) return null;
        const line = s.pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
        const area = `${line} L${s.pts[s.pts.length - 1][0].toFixed(1)},${BASE_Y} L${s.pts[0][0].toFixed(1)},${BASE_Y} Z`;
        const c = colorOf(s.era);
        return (
          <g key={si}>
            <path d={area} fill={c} fillOpacity={0.22} />
            <path d={line} fill="none" stroke={c} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
      {years.map((yr, i) =>
        yr.year % 5 === 0 || i === years.length - 1 ? (
          <text
            key={yr.year}
            x={X0 + i * slot + slot / 2}
            y={BASE_Y + 22}
            fill={COLORS.inkFaint}
            fontSize={17}
            fontFamily={FONT_MONO}
            textAnchor="middle"
            opacity={i < shown ? 1 : 0}
          >
            {yr.year}
          </text>
        ) : null,
      )}
    </>
  );
};

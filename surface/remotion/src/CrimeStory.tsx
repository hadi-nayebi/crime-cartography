import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
import type { StoryProps } from "./data/types";
import { deriveStats } from "./data/derive";
import { buildMapProjection, MapLayer } from "./components/MapLayer";
import { DotLayer } from "./components/DotLayer";
import { TrendArrows } from "./components/TrendArrows";
import { Clock } from "./components/Clock";
import { Counters } from "./components/Counters";
import { Feed } from "./components/Feed";
import { TimelineChart } from "./components/TimelineChart";
import { Leaderboard } from "./components/Leaderboard";
import { Legend } from "./components/Legend";
import { PhaseTitle } from "./components/PhaseTitle";
import { ColdOpen } from "./components/ColdOpen";
import { HookOpen } from "./components/HookOpen";
import { MethodCard } from "./components/MethodCard";
import { SocialCue } from "./components/SocialCue";
import { HistoryEra } from "./components/HistoryEra";
import { FullTrend } from "./components/FullTrend";
import { Quiz } from "./components/Quiz";
import { EraTransition } from "./components/EraTransition";
import { Annotation } from "./components/Annotation";
import { MapAnnotation } from "./components/MapAnnotation";
import { Reveal } from "./components/Reveal";
import { Credits } from "./components/Credits";
import { SourceCredit } from "./components/SourceCredit";
import { RealPointsLayer } from "./components/RealPointsLayer";
import { BasemapLayer } from "./components/BasemapLayer";
import { applyThemeOverrides, CAT_COLORS, COLORS, PHASES } from "./theme";

const WINDOW_MONTHS = 6; // choropleth window
const DOT_WINDOW = 3; // dot-density window
const ARROW_WINDOW = 3; // trailing window for per-beat trend arrows
const PER_DOT = 4; // incidents per dot
const DEFAULT_REPO_URL = "github.com/hadi-nayebi/crime-cartography";

function accentFor(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("propert")) return CAT_COLORS.property;
  if (t.includes("societ")) return CAT_COLORS.society;
  if (t.includes("local") || t.includes("other")) return CAT_COLORS.other;
  return CAT_COLORS.persons;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const CrimeStory: React.FC<StoryProps> = (props) => {
  const {
    bundle,
    emphasizeGroupA,
    annotations,
    historyNotes,
    title,
    subtitle,
    audioSrc,
    copy,
    theme,
  } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const repoUrl = props.repoUrl ?? DEFAULT_REPO_URL;

  // Per-city palette — merged once before any color is read this render.
  useMemo(() => applyThemeOverrides(theme), [theme]);

  // Hooks must run unconditionally (no early return above them).
  // The MAP chapter covers at most mapWindowMonths trailing months (default
  // 5 years): the long arc belongs to the trend chapter; the map answers
  // "where is it happening NOW and how has it shifted recently".
  const winBundle = useMemo(() => {
    if (!bundle) return null;
    const w = props.mapWindowMonths ?? 60;
    const N = bundle.timeline.months.length;
    if (N <= w) return bundle;
    const s = N - w;
    const months = bundle.timeline.months.slice(s);
    const cells = Object.fromEntries(
      Object.entries(bundle.timeline.cells).map(([k, v]) => [k, v.slice(s)]),
    );
    const startDate = `${months[0]}-01`;
    return {
      ...bundle,
      timeline: { months, cells },
      feed: bundle.feed.filter((f) => f.date >= startDate),
      points: bundle.points
        ? { ...bundle.points, months: bundle.points.months.slice(s), pts: bundle.points.pts.slice(s) }
        : null,
      summary: { ...bundle.summary, dateMin: startDate, months: months.length },
    };
  }, [bundle, props.mapWindowMonths]);
  const stats = useMemo(
    () => (winBundle ? deriveStats(winBundle, WINDOW_MONTHS, emphasizeGroupA) : null),
    [winBundle, emphasizeGroupA],
  );
  const projection = useMemo(() => (winBundle ? buildMapProjection(winBundle) : null), [winBundle]);

  if (!bundle || !winBundle || !stats || !projection) {
    return (
      <AbsoluteFill style={{ background: COLORS.bg, color: COLORS.ink, padding: 60 }}>
        Dataset not loaded — run scripts/sync-data.mjs and check datasetDir.
      </AbsoluteFill>
    );
  }

  const monthCount = stats.months.length;
  const history = bundle.history;
  const trend = bundle.trend;
  // Chapter 1 sweeps the FULL trend (to the present) when available.
  const nYears = trend ? trend.years.length : history ? history.years.length : 0;
  const startYear = winBundle.summary.dateMin.slice(0, 4); // map-window start
  const endYear = winBundle.summary.dateMax.slice(0, 4);
  // For the era-bridge card: the last FBI-measure year (seam − 1) when a full
  // trend exists, else the FBI history file's last year.
  const fbiEraYears = trend ? trend.years.filter((y) => y.era === "fbi") : null;
  const lastHistYear = fbiEraYears
    ? fbiEraYears[fbiEraYears.length - 1].year
    : history
      ? history.years[history.years.length - 1].year
      : undefined;
  const lastFbiTotal = fbiEraYears
    ? fbiEraYears[fbiEraYears.length - 1].total
    : history
      ? history.years[history.years.length - 1].total
      : undefined;
  const rawOtherLabel = bundle.summary.cats.other.label;
  const otherLabel = /context/i.test(rawOtherLabel) ? rawOtherLabel : `${rawOtherLabel} (context)`;

  // --- time mapping ---
  // history yearFloat across the history phase
  const yearFloat = clamp(
    ((sec - PHASES.methodEnd) / (PHASES.historyEnd - PHASES.methodEnd)) * nYears,
    0,
    nYears,
  );
  // granular month float across the granular phase; frozen at full after.
  const gFloat =
    sec <= PHASES.transitionEnd
      ? 0
      : sec >= PHASES.granularEnd
        ? monthCount
        : ((sec - PHASES.transitionEnd) / (PHASES.granularEnd - PHASES.transitionEnd)) *
          monthCount;

  // --- opacity envelopes ---
  const mapOpacity = interpolate(sec, [0.3, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // beats are dim context during history, full during granular/reveal
  const beatContext = interpolate(
    sec,
    [PHASES.transitionEnd - 4, PHASES.transitionEnd + 2],
    [0.18, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const heatOpacity = Math.min(
    interpolate(sec, [PHASES.transitionEnd, PHASES.transitionEnd + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(sec, [PHASES.revealEnd + 1, PHASES.revealEnd + 6], [1, 0.12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const dotsOpacity = Math.min(
    interpolate(sec, [PHASES.transitionEnd + 1, PHASES.transitionEnd + 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(sec, [PHASES.granularEnd + 1, PHASES.granularEnd + 5], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const granHud = Math.min(
    interpolate(sec, [PHASES.transitionEnd + 1, PHASES.transitionEnd + 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(sec, [PHASES.granularEnd - 4, PHASES.granularEnd], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const historyOpacity = Math.min(
    interpolate(sec, [PHASES.methodEnd - 2, PHASES.methodEnd + 2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(sec, [PHASES.historyEnd - 3, PHASES.historyEnd], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const closeDark = interpolate(sec, [PHASES.revealEnd + 1, PHASES.revealEnd + 6], [0, 0.82], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // --- granular annotation sequences ---
  const annoSeqs = annotations
    .map((a) => {
      const i = stats.months.indexOf(a.atMonth);
      if (i < 0) return null;
      const secAt = PHASES.transitionEnd + (i / monthCount) * (PHASES.granularEnd - PHASES.transitionEnd);
      const durFrames = Math.round(4.6 * fps);
      let startFrame = Math.round(secAt * fps);
      const maxStart = Math.round(PHASES.granularEnd * fps) - durFrames;
      if (startFrame > maxStart) startFrame = maxStart;
      const beatStat = a.beat ? stats.beats.find((b) => b.key === a.beat) : null;
      const anchor = beatStat ? projection.project(beatStat.centroid[0], beatStat.centroid[1]) : null;
      return { a, startFrame, durFrames, anchor };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // --- history note sequences (anchored to the full-trend years when present) ---
  const histSeqs = (trend || history ? historyNotes : [])
    .map((h) => {
      const i = trend
        ? trend.years.findIndex((y) => y.year === h.atYear)
        : history!.years.findIndex((y) => y.year === h.atYear);
      if (i < 0) return null;
      const secAt = PHASES.methodEnd + (i / nYears) * (PHASES.historyEnd - PHASES.methodEnd);
      const durFrames = Math.round(4.6 * fps);
      let startFrame = Math.round(secAt * fps);
      const maxStart = Math.round(PHASES.historyEnd * fps) - durFrames;
      if (startFrame > maxStart) startFrame = maxStart;
      return { h, startFrame, durFrames };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // --- quiz options (safest / mid / busiest) by NEIGHBORHOOD, alphabetized so
  // position is no tell. Answer (fewest Group A) is revealed only at the end. ---
  const rk = stats.hoodRanking;
  const quizOptions =
    rk.length >= 3
      ? Array.from(
          new Set([
            rk[rk.length - 1].name, // safest (answer)
            rk[Math.floor(rk.length / 2)].name, // mid
            rk[0].name, // busiest
          ]),
        ).sort()
      : rk.map((h) => h.name);
  // Quiz = the commitment hook (information gap) — posed EARLY, paid off at the
  // reveal. Research: the viewer decides in the first ~15–30s; give them a
  // reason to stay before the first minute ends.
  const quizStart = Math.round(35 * fps);
  const quizDur = Math.round(45 * fps);

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily: "sans-serif" }}>
      {audioSrc && <Audio src={staticFile(audioSrc)} />}

      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 52% 46%, rgba(20,28,40,0.5), rgba(3,5,8,0.0) 60%)" }} />

      {/* Map backdrop — dim context in history, full in granular era */}
      <div style={{ opacity: beatContext }}>
        <MapLayer
          bundle={winBundle}
          projection={projection}
          stats={stats}
          monthFloat={gFloat}
          windowMonths={WINDOW_MONTHS}
          emphasizeGroupA={emphasizeGroupA}
          mapOpacity={mapOpacity}
          heatOpacity={heatOpacity}
          showSymbols={false}
        />
      </div>

      {/* Orientation basemap (OSM highways + landmarks) — above the choropleth,
          below the dots, so viewers can tell where in the city they're looking. */}
      {bundle.basemap && (
        <BasemapLayer
          basemap={bundle.basemap}
          projection={projection}
          opacity={heatOpacity * 0.95}
          labelOpacity={granHud}
        />
      )}

      {/* Incident dots (granular era): REAL sampled locations when the source
          publishes coordinates; disclosed density glyphs otherwise. */}
      {winBundle.points ? (
        <RealPointsLayer
          points={winBundle.points}
          projection={projection}
          monthFloat={gFloat}
          windowMonths={DOT_WINDOW}
          opacity={dotsOpacity}
          emphasizeGroupA={emphasizeGroupA}
        />
      ) : (
        <DotLayer
          beatsByKey={winBundle.beats.beats}
          stats={stats}
          projection={projection}
          monthFloat={gFloat}
          windowMonths={DOT_WINDOW}
          perDot={PER_DOT}
          opacity={dotsOpacity}
        />
      )}

      {/* Per-beat trend arrows (rising/falling vs prior window) */}
      <TrendArrows
        stats={stats}
        projection={projection}
        monthFloat={gFloat}
        windowMonths={ARROW_WINDOW}
        opacity={dotsOpacity}
      />

      {/* Chapter 1 — the FULL long arc to the present (trend.json); the old
          FBI-only HistoryEra remains only as a fallback for datasets without
          a built trend. */}
      {trend && historyOpacity > 0.001 ? (
        <FullTrend
          trend={trend}
          yearFloat={yearFloat}
          opacity={historyOpacity}
          style={props.trendStyle}
          accent={CAT_COLORS.property}
          punchline={props.punchline}
          seamExplain={copy?.seamExplain}
          contextAnchors={props.contextAnchors ?? []}
        />
      ) : history && historyOpacity > 0.001 ? (
        <HistoryEra history={history} yearFloat={yearFloat} opacity={historyOpacity} />
      ) : null}

      {/* Chapter title strip (granular era) */}
      <PhaseTitle
        sec={sec}
        kicker={copy?.chapter2Kicker}
        title={copy?.chapter2Title}
        caption={copy?.chapter2Caption}
      />

      {/* Granular HUD */}
      <div style={{ opacity: granHud }}>
        <Clock months={stats.months} monthFloat={gFloat} />
        <Counters
          cityMonthly={stats.cityMonthly}
          monthFloat={gFloat}
          sinceYear={startYear}
          otherLabel={otherLabel}
          countTerm={copy?.countTerm}
        />
        <Feed feed={winBundle.feed} months={stats.months} monthFloat={gFloat} />
        <Legend
          opacity={granHud}
          perDot={PER_DOT}
          realPoints={Boolean(bundle.points)}
          otherLabel={otherLabel}
        />
        <TimelineChart
          months={stats.months}
          cityMonthly={stats.cityMonthly}
          monthFloat={gFloat}
          refRate={lastFbiTotal ? lastFbiTotal / 12 : undefined}
          refLabel={
            lastFbiTotal
              ? `${lastHistYear} UCR Violent+Property ≈ ${Math.round(lastFbiTotal / 12)}/mo (narrower count)`
              : undefined
          }
          countTerm={copy?.countTerm}
        />
      </div>
      <Leaderboard stats={stats} gFloat={gFloat} opacity={granHud} countTerm={copy?.countTerm} />

      {/* Granular annotations */}
      {annoSeqs.map(({ a, startFrame, durFrames, anchor }, idx) => (
        <Sequence key={`a${idx}`} from={startFrame} durationInFrames={durFrames} layout="none">
          {anchor ? (
            <MapAnnotation x={anchor[0]} y={anchor[1]} text={a.text} accent={accentFor(a.text)} durationInFrames={durFrames} />
          ) : (
            <Annotation text={a.text} durationInFrames={durFrames} accent={accentFor(a.text)} region="granular" />
          )}
        </Sequence>
      ))}

      {/* History notes (lower third) */}
      {histSeqs.map(({ h, startFrame, durFrames }, idx) => (
        <Sequence key={`h${idx}`} from={startFrame} durationInFrames={durFrames} layout="none">
          <Annotation text={h.text} durationInFrames={durFrames} accent={accentFor(h.text)} region="history" />
        </Sequence>
      ))}

      {/* Cold open — a verified shock-stat HOOK when configured, else title */}
      <Sequence durationInFrames={Math.round(PHASES.coldOpenEnd * fps)} layout="none">
        {props.hook ? (
          <HookOpen
            stat={props.hook.stat}
            line={props.hook.line}
            sub={props.hook.sub}
            title={title}
            subtitle={subtitle}
            durationInFrames={Math.round(PHASES.coldOpenEnd * fps)}
            accent={CAT_COLORS.property}
          />
        ) : (
          <ColdOpen title={title} subtitle={subtitle} durationInFrames={Math.round(PHASES.coldOpenEnd * fps)} />
        )}
      </Sequence>

      {/* Method card */}
      <Sequence from={Math.round(PHASES.coldOpenEnd * fps)} durationInFrames={Math.round((PHASES.methodEnd - PHASES.coldOpenEnd) * fps)} layout="none">
        <MethodCard
          summary={bundle.summary}
          history={history}
          trend={trend}
          durationInFrames={Math.round((PHASES.methodEnd - PHASES.coldOpenEnd) * fps)}
          recentTag={copy?.methodRecentTag}
          recentSub={copy?.methodRecentSub}
          dotsHeadline={copy?.methodDotsHeadline}
          dotsSub={copy?.methodDotsSub}
          footnote={copy?.methodFootnote}
        />
      </Sequence>

      {/* Engagement quiz — posed during the history era, answered at the reveal */}
      {quizOptions.length >= 2 && (
        <Sequence from={quizStart} durationInFrames={quizDur} layout="none">
          <Quiz
            options={quizOptions}
            durationInFrames={quizDur}
            question={copy?.quizQuestion}
            spanLabel={`${startYear}–${endYear}`}
            countTerm={copy?.countTerm}
          />
        </Sequence>
      )}

      {/* Era transition */}
      <Sequence from={Math.round(PHASES.historyEnd * fps)} durationInFrames={Math.round((PHASES.transitionEnd - PHASES.historyEnd) * fps)} layout="none">
        <EraTransition
          durationInFrames={Math.round((PHASES.transitionEnd - PHASES.historyEnd) * fps)}
          ucrAnnual={trend ? undefined : lastFbiTotal}
          ucrMonthly={trend ? undefined : lastFbiTotal ? lastFbiTotal / 12 : undefined}
          nibrsMonthly={monthCount > 0 ? stats.grandTotalGroupA / monthCount : undefined}
          kicker={copy?.transitionKicker}
          title={copy?.transitionTitle}
          desc={copy?.transitionDesc}
          lastHistoryYear={lastHistYear}
        />
      </Sequence>

      {/* Reveal */}
      <Sequence from={Math.round(PHASES.granularEnd * fps)} durationInFrames={Math.round((PHASES.revealEnd - PHASES.granularEnd) * fps)} layout="none">
        <Reveal stats={stats} summary={winBundle.summary} durationInFrames={Math.round((PHASES.revealEnd - PHASES.granularEnd) * fps)} countTerm={copy?.countTerm} />
      </Sequence>

      {/* Close */}
      <AbsoluteFill style={{ background: `rgba(3,5,8,${closeDark})`, pointerEvents: "none" }} />
      <Sequence from={Math.round(PHASES.revealEnd * fps)} durationInFrames={Math.round((PHASES.closeEnd - PHASES.revealEnd) * fps)} layout="none">
        <Credits
          summary={bundle.summary}
          repoUrl={repoUrl}
          durationInFrames={Math.round((PHASES.closeEnd - PHASES.revealEnd) * fps)}
          headline={
            copy?.cityName
              ? `${copy.cityName} · ${history ? history.yearMin : startYear}–${endYear}`
              : undefined
          }
          sources={copy?.creditsSources}
          musicCredit={copy?.musicCredit}
          regionNounPlural={copy?.regionNoun ? `${copy.regionNoun}s` : undefined}
        />
      </Sequence>

      {/* Engagement drops — like / subscribe / share, spaced across the runtime */}
      <Sequence from={Math.round(52 * fps)} durationInFrames={Math.round(4.5 * fps)} layout="none">
        <SocialCue kind="subscribe" durationInFrames={Math.round(4.5 * fps)} />
      </Sequence>
      <Sequence from={Math.round(205 * fps)} durationInFrames={Math.round(4.5 * fps)} layout="none">
        <SocialCue kind="like" durationInFrames={Math.round(4.5 * fps)} />
      </Sequence>
      <Sequence from={Math.round(272 * fps)} durationInFrames={Math.round(4.5 * fps)} layout="none">
        <SocialCue kind="share" durationInFrames={Math.round(4.5 * fps)} />
      </Sequence>

      {/* Persistent honesty strip */}
      <SourceCredit
        coveragePct={bundle.summary.coveragePct}
        showCoverage={sec >= PHASES.transitionEnd}
        line={copy?.sourceLine}
        regionNoun={copy?.regionNoun}
        coverageText={copy?.coverageText}
      />
    </AbsoluteFill>
  );
};

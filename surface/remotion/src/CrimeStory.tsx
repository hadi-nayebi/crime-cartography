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
import { MethodCard } from "./components/MethodCard";
import { HistoryEra } from "./components/HistoryEra";
import { Quiz } from "./components/Quiz";
import { EraTransition } from "./components/EraTransition";
import { Annotation } from "./components/Annotation";
import { MapAnnotation } from "./components/MapAnnotation";
import { Reveal } from "./components/Reveal";
import { Credits } from "./components/Credits";
import { SourceCredit } from "./components/SourceCredit";
import { CAT_COLORS, COLORS, PHASES } from "./theme";

const WINDOW_MONTHS = 6; // choropleth window
const DOT_WINDOW = 3; // dot-density window
const ARROW_WINDOW = 3; // trailing window for per-beat trend arrows
const PER_DOT = 4; // incidents per dot
const REPO_URL = "github.com/hadi-nayebi/crime-cartography";

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
  } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  if (!bundle) {
    return (
      <AbsoluteFill style={{ background: COLORS.bg, color: COLORS.ink, padding: 60 }}>
        Dataset not loaded — run scripts/sync-data.mjs and check datasetDir.
      </AbsoluteFill>
    );
  }

  const stats = useMemo(
    () => deriveStats(bundle, WINDOW_MONTHS, emphasizeGroupA),
    [bundle, emphasizeGroupA],
  );
  const projection = useMemo(() => buildMapProjection(bundle), [bundle]);
  const monthCount = stats.months.length;
  const history = bundle.history;
  const nYears = history ? history.years.length : 0;

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

  // --- history note sequences ---
  const histSeqs = (history ? historyNotes : [])
    .map((h) => {
      const i = history!.years.findIndex((y) => y.year === h.atYear);
      if (i < 0) return null;
      const secAt = PHASES.methodEnd + (i / nYears) * (PHASES.historyEnd - PHASES.methodEnd);
      const durFrames = Math.round(4.6 * fps);
      let startFrame = Math.round(secAt * fps);
      const maxStart = Math.round(PHASES.historyEnd * fps) - durFrames;
      if (startFrame > maxStart) startFrame = maxStart;
      return { h, startFrame, durFrames };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // --- quiz options (safest / mid / busiest), alphabetized so position is no
  // tell. Answer (fewest Group A) is revealed only at the end. ---
  const rk = stats.ranking;
  const quizOptions =
    rk.length >= 3
      ? Array.from(
          new Set([
            rk[rk.length - 1].key, // safest (answer)
            rk[Math.floor(rk.length / 2)].key, // mid
            rk[0].key, // busiest
          ]),
        ).sort()
      : rk.map((b) => b.key);
  const quizStart = Math.round(92 * fps);
  const quizDur = Math.round(52 * fps);

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily: "sans-serif" }}>
      {audioSrc && <Audio src={staticFile(audioSrc)} />}

      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 52% 46%, rgba(20,28,40,0.5), rgba(3,5,8,0.0) 60%)" }} />

      {/* Map backdrop — dim context in history, full in granular era */}
      <div style={{ opacity: beatContext }}>
        <MapLayer
          bundle={bundle}
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

      {/* Dot-density (granular era) */}
      <DotLayer
        beatsByKey={bundle.beats.beats}
        stats={stats}
        projection={projection}
        monthFloat={gFloat}
        windowMonths={DOT_WINDOW}
        perDot={PER_DOT}
        opacity={dotsOpacity}
      />

      {/* Per-beat trend arrows (rising/falling vs prior window) */}
      <TrendArrows
        stats={stats}
        projection={projection}
        monthFloat={gFloat}
        windowMonths={ARROW_WINDOW}
        opacity={dotsOpacity}
      />

      {/* History era panel */}
      {history && historyOpacity > 0.001 && (
        <HistoryEra history={history} yearFloat={yearFloat} opacity={historyOpacity} />
      )}

      {/* Chapter title strip (granular era) */}
      <PhaseTitle sec={sec} />

      {/* Granular HUD */}
      <div style={{ opacity: granHud }}>
        <Clock months={stats.months} monthFloat={gFloat} />
        <Counters cityMonthly={stats.cityMonthly} monthFloat={gFloat} />
        <Feed feed={bundle.feed} months={stats.months} monthFloat={gFloat} />
        <Legend opacity={granHud} perDot={PER_DOT} />
        <TimelineChart
          months={stats.months}
          cityMonthly={stats.cityMonthly}
          monthFloat={gFloat}
        />
      </div>
      <Leaderboard stats={stats} gFloat={gFloat} opacity={granHud} />

      {/* Granular annotations */}
      {annoSeqs.map(({ a, startFrame, durFrames, anchor }, idx) => (
        <Sequence key={`a${idx}`} from={startFrame} durationInFrames={durFrames} layout="none">
          {anchor ? (
            <MapAnnotation x={anchor[0]} y={anchor[1]} text={a.text} accent={accentFor(a.text)} durationInFrames={durFrames} />
          ) : (
            <Annotation text={a.text} durationInFrames={durFrames} accent={accentFor(a.text)} />
          )}
        </Sequence>
      ))}

      {/* History notes (lower third) */}
      {histSeqs.map(({ h, startFrame, durFrames }, idx) => (
        <Sequence key={`h${idx}`} from={startFrame} durationInFrames={durFrames} layout="none">
          <Annotation text={h.text} durationInFrames={durFrames} accent={accentFor(h.text)} />
        </Sequence>
      ))}

      {/* Cold open */}
      <Sequence from={0} durationInFrames={Math.round(PHASES.coldOpenEnd * fps)} layout="none">
        <ColdOpen title={title} subtitle={subtitle} durationInFrames={Math.round(PHASES.coldOpenEnd * fps)} />
      </Sequence>

      {/* Method card */}
      <Sequence from={Math.round(PHASES.coldOpenEnd * fps)} durationInFrames={Math.round((PHASES.methodEnd - PHASES.coldOpenEnd) * fps)} layout="none">
        <MethodCard summary={bundle.summary} history={history} durationInFrames={Math.round((PHASES.methodEnd - PHASES.coldOpenEnd) * fps)} />
      </Sequence>

      {/* Engagement quiz — posed during the history era, answered at the reveal */}
      {quizOptions.length >= 2 && (
        <Sequence from={quizStart} durationInFrames={quizDur} layout="none">
          <Quiz options={quizOptions} durationInFrames={quizDur} />
        </Sequence>
      )}

      {/* Era transition */}
      <Sequence from={Math.round(PHASES.historyEnd * fps)} durationInFrames={Math.round((PHASES.transitionEnd - PHASES.historyEnd) * fps)} layout="none">
        <EraTransition durationInFrames={Math.round((PHASES.transitionEnd - PHASES.historyEnd) * fps)} />
      </Sequence>

      {/* Reveal */}
      <Sequence from={Math.round(PHASES.granularEnd * fps)} durationInFrames={Math.round((PHASES.revealEnd - PHASES.granularEnd) * fps)} layout="none">
        <Reveal stats={stats} summary={bundle.summary} durationInFrames={Math.round((PHASES.revealEnd - PHASES.granularEnd) * fps)} />
      </Sequence>

      {/* Close */}
      <AbsoluteFill style={{ background: `rgba(3,5,8,${closeDark})`, pointerEvents: "none" }} />
      <Sequence from={Math.round(PHASES.revealEnd * fps)} durationInFrames={Math.round((PHASES.closeEnd - PHASES.revealEnd) * fps)} layout="none">
        <Credits summary={bundle.summary} repoUrl={REPO_URL} durationInFrames={Math.round((PHASES.closeEnd - PHASES.revealEnd) * fps)} />
      </Sequence>

      {/* Persistent honesty strip */}
      <SourceCredit coveragePct={bundle.summary.coveragePct} showCoverage={sec >= PHASES.transitionEnd} />
    </AbsoluteFill>
  );
};

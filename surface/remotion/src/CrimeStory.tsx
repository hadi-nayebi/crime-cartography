import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { StoryProps } from "./data/types";
import { deriveStats, sweepMonthFloat } from "./data/derive";
import { buildMapProjection, MapLayer } from "./components/MapLayer";
import { Clock } from "./components/Clock";
import { Counters } from "./components/Counters";
import { Feed } from "./components/Feed";
import { TimelineChart } from "./components/TimelineChart";
import { ColdOpen } from "./components/ColdOpen";
import { MethodCard } from "./components/MethodCard";
import { Annotation } from "./components/Annotation";
import { Reveal } from "./components/Reveal";
import { Credits } from "./components/Credits";
import { SourceCredit } from "./components/SourceCredit";
import { CAT_COLORS, COLORS, FRAME, PHASES } from "./theme";

const WINDOW_MONTHS = 6;
const REPO_URL = "github.com/hadi-nayebi/crime-cartography";

// Pick an accent color for an annotation from a keyword in its text.
function accentFor(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("propert")) return CAT_COLORS.property;
  if (t.includes("societ")) return CAT_COLORS.society;
  if (t.includes("local") || t.includes("other")) return CAT_COLORS.other;
  return CAT_COLORS.persons;
}

export const CrimeStory: React.FC<StoryProps> = (props) => {
  const { bundle, emphasizeGroupA, annotations, title, subtitle } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  // Guard: if the bundle failed to load, render a clear placeholder rather
  // than fabricate anything.
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

  const monthFloat = sweepMonthFloat(
    frame,
    fps,
    PHASES.sweepStart,
    PHASES.sweepEnd,
    monthCount,
  );

  // Opacity envelopes (deterministic functions of time).
  const mapOpacity = interpolate(sec, [0.3, 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const heatOpacity =
    Math.min(
      interpolate(sec, [44, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      interpolate(sec, [PHASES.revealEnd + 1, PHASES.revealEnd + 6], [1, 0.12], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    );
  const hudOpacity = Math.min(
    interpolate(sec, [43, 47], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(sec, [PHASES.sweepEnd - 4, PHASES.sweepEnd], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const closeDark = interpolate(sec, [PHASES.revealEnd + 1, PHASES.revealEnd + 6], [0, 0.82], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Annotation sequences mapped onto the sweep timeline.
  const annoSeqs = annotations
    .map((a) => {
      const i = stats.months.indexOf(a.atMonth);
      if (i < 0) return null;
      const secAt =
        PHASES.sweepStart + (i / monthCount) * (PHASES.sweepEnd - PHASES.sweepStart);
      const durFrames = Math.round(4.4 * fps);
      let startFrame = Math.round(secAt * fps);
      const maxStart = Math.round(PHASES.sweepEnd * fps) - durFrames;
      if (startFrame > maxStart) startFrame = maxStart;
      return { a, startFrame, durFrames };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily: "sans-serif" }}>
      {/* subtle vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 52% 46%, rgba(20,28,40,0.5), rgba(3,5,8,0.0) 60%)",
        }}
      />

      {/* The map backdrop — real beat polygons + per-beat aggregate heat */}
      <MapLayer
        bundle={bundle}
        projection={projection}
        stats={stats}
        monthFloat={monthFloat}
        windowMonths={WINDOW_MONTHS}
        emphasizeGroupA={emphasizeGroupA}
        mapOpacity={mapOpacity}
        heatOpacity={heatOpacity}
      />

      {/* HUD — clock, counters, feed, chart (sweep phase) */}
      <div style={{ opacity: hudOpacity }}>
        <Clock months={stats.months} monthFloat={monthFloat} />
        <Counters cityMonthly={stats.cityMonthly} monthFloat={monthFloat} />
        <Feed feed={bundle.feed} months={stats.months} monthFloat={monthFloat} />
        <TimelineChart
          months={stats.months}
          cityMonthly={stats.cityMonthly}
          cityCumulative={stats.cityCumulative}
          grandTotalAll={stats.grandTotalAll}
          monthFloat={monthFloat}
        />
      </div>

      {/* Annotations ("air messages") */}
      {annoSeqs.map(({ a, startFrame, durFrames }, idx) => (
        <Sequence key={idx} from={startFrame} durationInFrames={durFrames} layout="none">
          <Annotation text={a.text} durationInFrames={durFrames} accent={accentFor(a.text)} />
        </Sequence>
      ))}

      {/* Cold open */}
      <Sequence from={0} durationInFrames={Math.round(PHASES.coldOpenEnd * fps)} layout="none">
        <ColdOpen title={title} subtitle={subtitle} durationInFrames={Math.round(PHASES.coldOpenEnd * fps)} />
      </Sequence>

      {/* Method card */}
      <Sequence
        from={Math.round(PHASES.coldOpenEnd * fps)}
        durationInFrames={Math.round((PHASES.methodEnd - PHASES.coldOpenEnd) * fps)}
        layout="none"
      >
        <MethodCard
          summary={bundle.summary}
          durationInFrames={Math.round((PHASES.methodEnd - PHASES.coldOpenEnd) * fps)}
        />
      </Sequence>

      {/* Reveal */}
      <Sequence
        from={Math.round(PHASES.sweepEnd * fps)}
        durationInFrames={Math.round((PHASES.revealEnd - PHASES.sweepEnd) * fps)}
        layout="none"
      >
        <Reveal
          stats={stats}
          summary={bundle.summary}
          durationInFrames={Math.round((PHASES.revealEnd - PHASES.sweepEnd) * fps)}
        />
      </Sequence>

      {/* Close darkening + credits */}
      <AbsoluteFill style={{ background: `rgba(3,5,8,${closeDark})`, pointerEvents: "none" }} />
      <Sequence
        from={Math.round(PHASES.revealEnd * fps)}
        durationInFrames={Math.round((PHASES.closeEnd - PHASES.revealEnd) * fps)}
        layout="none"
      >
        <Credits
          summary={bundle.summary}
          repoUrl={REPO_URL}
          durationInFrames={Math.round((PHASES.closeEnd - PHASES.revealEnd) * fps)}
        />
      </Sequence>

      {/* Persistent honesty strip — always visible */}
      <SourceCredit coveragePct={bundle.summary.coveragePct} showCoverage={sec >= 44} />
    </AbsoluteFill>
  );
};

export const STORY_WIDTH = FRAME.w;
export const STORY_HEIGHT = FRAME.h;

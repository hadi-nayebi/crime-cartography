import "./index.css";
import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { CrimeStory } from "./CrimeStory";
import type { StoryProps } from "./data/types";
import { loadBundle } from "./data/load";
import { FRAME } from "./theme";

// Default props mirror videos/grand-rapids-mi/config.json. The CLI render passes
// --props=videos/grand-rapids-mi/config.json to override these; Studio uses them
// directly. Keep the two in sync (config.json is the canonical render input).
const GRAND_RAPIDS: StoryProps = {
  slug: "grand-rapids-mi",
  datasetDir: "data/grand-rapids-mi",
  title: "Grand Rapids · A Quarter-Century of Crime",
  subtitle:
    "FBI UCR 2000–2022 + GRPD NIBRS 2023–2026 · aggregated by police beat",
  durationSec: 330,
  fps: 30,
  emphasizeGroupA: true,
  audioSrc: "audio/grand-rapids-music-sao.wav",
  repoUrl: "github.com/hadi-nayebi/crime-cartography",
  copy: {
    cityName: "Grand Rapids",
    regionNoun: "police beat",
    chapter2Kicker: "CHAPTER 2 · 2023–2026 · GRPD NIBRS",
    chapter2Title: "The map comes alive — per police beat",
    chapter2Caption:
      "Live monthly reports by neighborhood. Dots show density within a beat, not exact spots.",
    transitionKicker: "2023 · GRPD NIBRS DATA BEGINS",
    transitionTitle: "The map comes alive",
    transitionDesc:
      "From here the data is incident-level and per police beat — four NIBRS categories, real monthly counts, distributed as density within each beat.",
    methodRecentTag: "GRPD NIBRS",
    methodDotsSub: "96.7% mapped to 33 beats — the rest counted, disclosed, never invented",
    methodFootnote:
      "FBI UCR (through 2022) and GRPD NIBRS (2023+) are different measures — shown as two chapters, not one line.",
    quizQuestion: "Which neighborhood is Grand Rapids' safest?",
    sourceLine:
      "Data: GRPD via City of Grand Rapids ArcGIS Hub · aggregated per police beat · no individual incidents plotted",
    creditsSources:
      "Sources: Grand Rapids Police Department crime data (2023–) & FBI UCR (2000–2022) via the City of Grand Rapids ArcGIS Hub. Beat polygons: GRPD Service Area Map. Neighborhood names: City of Grand Rapids Neighborhood Areas. Used under the City of Grand Rapids GIS Data Access & Use Constraint Agreement (provided “as is”).",
  },
  historyNotes: [
    {
      atYear: 2013,
      text: "Property crime fell sharply through the 2010s — from 10,942 in 2000 toward 3,869 by 2018.",
    },
    {
      atYear: 2018,
      text: "2018: property crime bottoms out at 3,869 — about 65% below its 2000 level.",
    },
    {
      atYear: 2020,
      text: "2020: violent crime jumps about 50% (1,299 → 1,951); property rises too.",
    },
  ],
  annotations: [
    {
      atMonth: "2023-04",
      text: "Each dot shows how many — spread within the beat to show density, not where a crime happened.",
    },
    {
      atMonth: "2023-07",
      text: "July 2023 is the highest month for Group A crime — 1,680 incidents citywide.",
    },
    {
      atMonth: "2024-07",
      text: "Property crime peaks in summer: ~663 reports/month in Jun–Aug versus ~503 in winter.",
    },
    {
      atMonth: "2025-06",
      text: "Beat CENTRAL 3 (Oldtown-Heartside, downtown) is the busiest single police beat for Group A crime. Larger multi-beat neighborhoods total more — see the finish.",
      beat: "CENTRAL 3",
    },
    {
      atMonth: "2026-05",
      text: "May 2026 is the highest month on record for Crimes Against Persons — 628 reports.",
    },
  ],
  bundle: null,
};

const calculateMetadata: CalculateMetadataFunction<StoryProps> = async ({
  props,
  abortSignal,
}) => {
  const bundle = await loadBundle(props.datasetDir, abortSignal);
  return {
    durationInFrames: Math.round(props.durationSec * props.fps),
    fps: props.fps,
    width: FRAME.w,
    height: FRAME.h,
    props: { ...props, bundle },
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CrimeStory"
      component={CrimeStory}
      durationInFrames={9000}
      fps={30}
      width={FRAME.w}
      height={FRAME.h}
      defaultProps={GRAND_RAPIDS}
      calculateMetadata={calculateMetadata}
    />
  );
};

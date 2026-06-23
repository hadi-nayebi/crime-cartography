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
  title: "Grand Rapids · Three Years of Crime, by the Numbers",
  subtitle: "GRPD records · Jan 2023 – Jun 2026 · aggregated by police beat",
  durationSec: 300,
  fps: 30,
  emphasizeGroupA: true,
  annotations: [
    {
      atMonth: "2023-04",
      text: "Most records are Local / Other ordinance reports — shown in grey, never counted as violent crime.",
    },
    {
      atMonth: "2023-07",
      text: "July 2023 is the period's single highest month for Group A crime — 1,680 incidents citywide.",
    },
    {
      atMonth: "2024-07",
      text: "Property crime peaks in summer: ~663 reports/month in Jun–Aug versus ~503 in winter.",
    },
    {
      atMonth: "2025-06",
      text: "Central 3 (downtown) carries the most Group A crime of any beat across the period.",
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

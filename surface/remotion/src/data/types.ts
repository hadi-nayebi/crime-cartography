// Shapes of the normalized bundle (data/<slug>/normalized/*). These mirror
// pipeline/normalize.mjs output exactly — keep in sync if the pipeline changes.

export type Cat = "persons" | "property" | "society" | "other";

export interface CatCounts {
  persons: number;
  property: number;
  society: number;
  other: number;
}

export interface Beat {
  key: string; // "CENTRAL 3"
  name: string;
  servcen: string; // "CENTRAL"
  beat: number; // 3
  centroid: [number, number]; // [lng, lat]
  polygon: number[][][]; // [ring][point][lng,lat]
  geomType: string;
}

export interface BeatsFile {
  cats: Record<Cat, { label: string; color: string }>;
  beats: Record<string, Beat>;
}

export interface TimelineFile {
  months: string[]; // ["2023-01", ...] length 42
  cells: Record<string, CatCounts[]>; // beatKey -> per-month counts (length === months)
}

export interface FeedItem {
  date: string; // YYYY-MM-DD
  title: string;
  place: string;
  beat: string;
  cat: Cat;
}

export interface Summary {
  slug: string;
  title: string;
  source: { records: string; beats: string; hub: string };
  fetchedAt: string;
  dateMin: string;
  dateMax: string;
  months: number;
  totalRecords: number;
  placedRecords: number;
  unplacedRecords: number;
  coveragePct: number;
  unplacedBeats: Record<string, number>;
  catTotals: CatCounts;
  cats: Record<Cat, { label: string; color: string }>;
  beatCount: number;
}

export interface HistoryYear {
  year: number;
  violent: number;
  property: number;
  total: number;
}

export interface HistoryFile {
  era: string;
  taxonomy: string;
  agency: string;
  ori: string;
  source: string;
  sourceUrl: string;
  cdeUrl: string;
  fetchedAt: string;
  presentation: string;
  note: string;
  yearMin: number;
  yearMax: number;
  cats: Record<"violent" | "property", { label: string; color: string }>;
  years: HistoryYear[];
}

export interface NeighborhoodMap {
  source: string;
  sourceUrl: string;
  hub: string;
  fetchedAt: string;
  license: string;
  method: string;
  // beat key -> official City neighborhood the beat centroid sits in
  map: Record<string, { name: string; approx: boolean }>;
}

// Optional sampled REAL incident locations (cities whose source publishes
// block-level coordinates). pts[monthIdx] = [lng, lat, catIdx] where catIdx
// indexes theme CATS order. Every point is a real reported incident location
// (anonymized to block by the source) — never synthesized.
export interface PointsFile {
  mode: "real-sample";
  note: string; // on-screen honesty wording, e.g. "sampled real incident locations (block-level)"
  sampleRate: number; // e.g. 1 point kept per N incidents
  months: string[]; // must align with timeline.months
  pts: Array<Array<[number, number, number]>>;
}

// The FULL long-arc annual series (earliest sourced year → last complete year),
// joining FBI UCR with the city's own incident data at an explicit labeled seam.
export interface TrendEra {
  key: "fbi" | "incident";
  label: string;
  from: number;
  to: number;
}
export interface TrendFile {
  note: string;
  fetchedAt: string;
  seamYear: number;
  eras: TrendEra[];
  years: Array<{ year: number; total: number; era: string }>;
}

export interface Bundle {
  beats: BeatsFile;
  timeline: TimelineFile;
  feed: FeedItem[];
  summary: Summary;
  history: HistoryFile | null; // FBI UCR deep-history era (optional per dataset)
  neighborhoods: NeighborhoodMap | null; // resident-known locator names (optional)
  points: PointsFile | null; // sampled REAL coordinates (optional per dataset)
  trend: TrendFile | null; // full arc to present (optional per dataset)
}

export interface Annotation {
  atMonth: string; // "2023-07" — must exist in timeline.months
  text: string; // factual, checkable against timeline.json
  beat?: string; // optional beat key to anchor the callout at that centroid
}

export interface HistoryNote {
  atYear: number; // must exist in history.years
  text: string; // checkable against history.json
}

// Per-city copy overrides. Every field is optional; the engine falls back to
// neutral defaults derived from the bundle (summary/history), so a config only
// declares what is genuinely city-specific. City-isms live HERE, not in the
// engine components.
export interface CityCopy {
  cityName?: string; // "Grand Rapids"
  regionNoun?: string; // "police beat" | "community area" | "neighborhood"
  chapter2Kicker?: string; // "CHAPTER 2 · 2023–2026 · GRPD NIBRS"
  chapter2Title?: string; // "The map comes alive — per police beat"
  chapter2Caption?: string; // one-line what-you're-seeing
  transitionKicker?: string; // "2023 · GRPD NIBRS DATA BEGINS"
  transitionTitle?: string;
  transitionDesc?: string;
  methodRecentTag?: string; // method card box-02 chip, e.g. "GRPD NIBRS"
  methodRecentSub?: string;
  methodDotsHeadline?: string; // box-03 headline (density vs real-locations)
  methodDotsSub?: string;
  methodFootnote?: string; // taxonomy caveat line
  quizQuestion?: string;
  sourceLine?: string; // persistent bottom honesty strip
  coverageText?: string; // full override for the coverage readout
  creditsSources?: string; // full sources/license paragraph
  musicCredit?: string;
}

// Per-city visual theme overrides, merged over theme.ts defaults at render.
export interface ThemeOverride {
  colors?: Partial<{
    bg: string;
    bgPanel: string;
    panelStroke: string;
    beatFill: string;
    beatStroke: string;
    ink: string;
    inkDim: string;
    inkFaint: string;
    grid: string;
  }>;
  catColors?: Partial<Record<Cat, string>>;
}

// Props the CrimeStory composition receives (videos/<slug>/config.json).
export interface StoryConfig {
  slug: string;
  datasetDir: string; // public-relative dir, e.g. "data/grand-rapids-mi"
  title: string;
  subtitle: string;
  durationSec: number;
  fps: number;
  annotations: Annotation[]; // granular era (2023+)
  historyNotes: HistoryNote[]; // deep-history era (2000–2022)
  emphasizeGroupA: boolean;
  audioSrc?: string; // public-relative wav, e.g. "audio/grand-rapids.wav"
  copy?: CityCopy; // city-specific strings (engine has neutral fallbacks)
  theme?: ThemeOverride; // city-specific palette
  repoUrl?: string; // shown in credits
  /** chart style for the long-arc chapter — per-city A/B variation. */
  trendStyle?: "bars" | "area" | "lollipop";
  /** cold-open hook: a verified shocking stat shown in the first seconds. */
  hook?: { stat: string; line: string; sub?: string };
  /** verified net-change punchline at the end of the long-arc chapter. */
  punchline?: { text: string; sub: string };
  /** map chapter covers at most this many trailing months (default 60 = 5yr). */
  mapWindowMonths?: number;
}

// After calculateMetadata, the bundle is attached to the props. The index
// signature lets it satisfy Remotion's Record<string, unknown> props constraint.
export interface StoryProps extends StoryConfig {
  bundle: Bundle | null;
  [key: string]: unknown;
}

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

export interface Bundle {
  beats: BeatsFile;
  timeline: TimelineFile;
  feed: FeedItem[];
  summary: Summary;
  history: HistoryFile | null; // FBI UCR deep-history era (optional per dataset)
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
}

// After calculateMetadata, the bundle is attached to the props. The index
// signature lets it satisfy Remotion's Record<string, unknown> props constraint.
export interface StoryProps extends StoryConfig {
  bundle: Bundle | null;
  [key: string]: unknown;
}

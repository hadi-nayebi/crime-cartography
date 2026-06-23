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

export interface Bundle {
  beats: BeatsFile;
  timeline: TimelineFile;
  feed: FeedItem[];
  summary: Summary;
}

export interface Annotation {
  atMonth: string; // "2023-07" — must exist in timeline.months
  text: string; // factual, checkable against timeline.json
}

// Props the CrimeStory composition receives (videos/<slug>/config.json).
export interface StoryConfig {
  slug: string;
  datasetDir: string; // public-relative dir, e.g. "data/grand-rapids-mi"
  title: string;
  subtitle: string;
  durationSec: number;
  fps: number;
  annotations: Annotation[];
  emphasizeGroupA: boolean;
}

// After calculateMetadata, the bundle is attached to the props. The index
// signature lets it satisfy Remotion's Record<string, unknown> props constraint.
export interface StoryProps extends StoryConfig {
  bundle: Bundle | null;
  [key: string]: unknown;
}

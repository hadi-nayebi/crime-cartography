import {readdir, readFile} from "node:fs/promises";
import {join} from "node:path";

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

const nonzeroCategoryCount = (summary) => Object.values(summary?.catTotals ?? {})
  .filter((value) => Number(value) > 0).length;

const spanOf = (trend) => {
  const years = (trend?.years ?? []).map((entry) => Number(entry.year)).filter(Number.isFinite);
  if (!years.length) return {from: null, to: null, years: 0};
  const from = Math.min(...years);
  const to = Math.max(...years);
  return {from, to, years: to - from + 1};
};

const priorPublications = (youtube) => (youtube?.previousPublications ?? []).map((publication) => ({
  platform: publication.platform,
  channel_id: publication.channel_id,
  video_id: publication.video_id,
  uploaded_at: publication.uploaded_at,
  removed_at: publication.removed_at,
  removal: publication.removal,
}));

export async function buildRemakeLedger({root, generatedAt = new Date().toISOString()}) {
  const contract = await readJson(join(root, "experiment/VIDEO-QUALITY-CONTRACT.json"));
  if (!contract) throw new Error("video quality contract is missing");
  const entries = await readdir(join(root, "videos"), {withFileTypes: true});
  const cities = [];

  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const slug = entry.name;
    const videoDirectory = join(root, "videos", slug);
    const dataDirectory = join(root, "data", slug, "normalized");
    const [config, summary, trend, youtube, renderLock] = await Promise.all([
      readJson(join(videoDirectory, "config.json")),
      readJson(join(dataDirectory, "summary.json")),
      readJson(join(dataDirectory, "trend.json")),
      readJson(join(videoDirectory, "youtube.json"), {}),
      readJson(join(videoDirectory, "render.lock.json")),
    ]);
    if (!config) continue;

    const span = spanOf(trend);
    const anchors = config.contextAnchors ?? [];
    const anchorsRequired =
      span.years >= contract.context_anchors.required_for_spans_of_at_least_years;
    const categoryCount = nonzeroCategoryCount(summary);
    const trendParts = (trend?.years ?? []).some(
      (year) => year.parts && Object.values(year.parts).filter((value) => Number(value) > 0).length >= 2,
    );
    const blockers = [];
    if (config.durationSec < contract.duration_seconds.minimum ||
        config.durationSec > contract.duration_seconds.maximum) {
      blockers.push("runtime-outside-quality-contract");
    }
    if (anchorsRequired && anchors.length < contract.context_anchors.minimum) {
      blockers.push("needs-sourced-context-anchors");
    }
    if (categoryCount >= 2 && !trendParts) {
      blockers.push("category-breakdown-needs-era-review");
    }
    blockers.push("needs-owner-remake-notes");
    blockers.push("needs-fresh-human-watch-through");

    cities.push({
      slug,
      title: config.title,
      duration_seconds: config.durationSec,
      historical_span: span,
      spatial_units: summary?.beatCount ?? null,
      records: summary?.totalRecords ?? null,
      coverage_percent: summary?.coveragePct ?? null,
      category_breakdown: {
        available_categories: categoryCount,
        annual_parts_available: trendParts,
        current_visual: config.trendStyle === "stacked"
          ? "stacked annual trend plus recent category timeline"
          : "recent category timeline; annual trend composition not foregrounded",
        remake_question: categoryCount >= 2
          ? "Would a category histogram or composition view add a memorable city-specific fact?"
          : "No defensible multi-category view is currently available.",
      },
      context_anchors: {
        required: anchorsRequired,
        minimum: anchorsRequired ? contract.context_anchors.minimum : 0,
        authored: anchors.length,
        ids: anchors.map((anchor) => anchor.id),
      },
      existing_render: renderLock
        ? {
            duration_seconds: renderLock.durationSec,
            sha256: renderLock.sha256,
            rendered_at: renderLock.renderedAt,
          }
        : null,
      prior_publications: priorPublications(youtube),
      destination_status: youtube?.videoId
        ? "published-on-current-destination"
        : "not-published",
      global_upgrade_rules: [
        "five-minute-factual-memory",
        "sourced-context-anchors",
        "category-composition-when-supported",
        "measurement-seams-before-comparison",
        "city-specific-anti-generic-pass",
        "human-final-three-takeaways",
      ],
      blockers,
      status: blockers.length ? "remake-review-required" : "ready-for-owner-approval",
    });
  }

  return {
    schema_version: "1.0.0",
    generated_at: generatedAt,
    contract_id: contract.contract_id,
    editorial_north_star: "experiment/EDITORIAL-NORTH-STAR.md",
    destination: {
      project_channel: "Crime Cartography",
      other_channels_in_scope: [],
    },
    test_release_recommendation: {
      candidates: ["atlanta-ga", "boston-ma"],
      status: "recommendation-only",
      rationale: "Atlanta tests category composition and contextual memory anchors; Boston tests the long-arc and spatial format on a previously released city.",
    },
    cities,
  };
}

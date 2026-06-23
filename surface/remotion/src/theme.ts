// Visual system constants for the crime-cartography surface.
// Palette mirrors the gr_crime_timeline.html shell; categories match the
// normalized bundle's `cats` (persons/property/society/other).

export const COLORS = {
  bg: "#07090d",
  bgPanel: "rgba(12,16,22,0.72)",
  panelStroke: "rgba(125,145,175,0.20)",
  beatFill: "#0d141d",
  beatStroke: "rgba(125,145,175,0.22)",
  ink: "#e7eef7",
  inkDim: "#9fb0c4",
  inkFaint: "#65788f",
  grid: "rgba(125,145,175,0.12)",
} as const;

// Category hues — keep in lockstep with summary.json `cats`.
export const CAT_COLORS: Record<string, string> = {
  persons: "#ff2e63",
  property: "#ffc233",
  society: "#34e0e0",
  other: "#7486a0",
};

export const CAT_LABELS: Record<string, string> = {
  persons: "Crimes Against Persons",
  property: "Crimes Against Property",
  society: "Crimes Against Society",
  other: "Local / Other",
};

export const CATS = ["persons", "property", "society", "other"] as const;
export const GROUP_A = ["persons", "property", "society"] as const;

export const FONT_MONO =
  "'SF Mono','JetBrains Mono','Fira Code',ui-monospace,'Cascadia Code',Menlo,Consolas,monospace";
export const FONT_SANS =
  "'Inter','Helvetica Neue',-apple-system,system-ui,sans-serif";

// 1920×1080 layout regions (px). The map is a full-frame backdrop; panels float.
export const FRAME = { w: 1920, h: 1080 } as const;

// Phase boundaries in seconds — two-era v2 arc (total 330s = 5:30).
// coldopen → method → history(2000–2022) → era-transition → granular(2023+) →
// reveal → close.
export const PHASES = {
  coldOpenEnd: 13,
  methodEnd: 39,
  historyEnd: 150, // FBI UCR deep-history sweep
  transitionEnd: 163, // era bridge card
  granularEnd: 292, // GRPD NIBRS granular sweep
  revealEnd: 318,
  closeEnd: 330,
} as const;

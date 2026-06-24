import React from "react";
import { CAT_COLORS, CAT_LABELS, GROUP_A, COLORS, FONT_MONO } from "../theme";

interface Props {
  opacity: number;
  perDot: number;
}

const RISE = "#ff3b5c";
const FALL = "#36e07a";

// Persistent legend for the granular era. Decodes every glyph on screen so any
// single frame is self-explanatory: category colors, what a dot means (density,
// NOT a location), and the up/down trend arrows.
export const Legend: React.FC<Props> = ({ opacity, perDot }) => {
  if (opacity <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 34,
        top: 720,
        width: 360,
        opacity,
        fontFamily: FONT_MONO,
        background: "rgba(8,11,16,0.72)",
        border: "1px solid rgba(125,145,175,0.22)",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 3, color: COLORS.inkFaint, marginBottom: 9 }}>
        HOW TO READ THIS MAP
      </div>

      {GROUP_A.map((cat) => (
        <Row key={cat} color={CAT_COLORS[cat]} label={CAT_LABELS[cat]} />
      ))}
      <Row color={CAT_COLORS.other} label="Local / ordinance (context)" dim />

      <div style={{ height: 1, background: "rgba(125,145,175,0.18)", margin: "10px 0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ display: "flex", gap: 3 }}>
          <Dot c={CAT_COLORS.persons} />
          <Dot c={CAT_COLORS.property} />
          <Dot c={CAT_COLORS.society} />
        </span>
        <span style={{ fontSize: 13.5, color: COLORS.inkDim }}>
          1 dot ≈ {perDot} incidents — spread to show density, not a location
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16, color: RISE }}>▲</span>
        <span style={{ fontSize: 13.5, color: COLORS.inkDim }}>rising vs prior 3 mo</span>
        <span style={{ fontSize: 16, color: FALL, marginLeft: 8 }}>▼</span>
        <span style={{ fontSize: 13.5, color: COLORS.inkDim }}>falling (better)</span>
      </div>
    </div>
  );
};

const Row: React.FC<{ color: string; label: string; dim?: boolean }> = ({
  color,
  label,
  dim,
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, opacity: dim ? 0.7 : 1 }}>
    <span style={{ width: 12, height: 12, borderRadius: 3, background: color, flex: "0 0 auto" }} />
    <span style={{ fontSize: 14, color: COLORS.inkDim }}>{label}</span>
  </div>
);

const Dot: React.FC<{ c: string }> = ({ c }) => (
  <span style={{ width: 9, height: 9, borderRadius: 5, background: c, display: "inline-block" }} />
);

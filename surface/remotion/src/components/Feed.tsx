import React, { useMemo } from "react";
import type { FeedItem } from "../data/types";
import { CAT_COLORS, COLORS, FONT_MONO } from "../theme";

interface Props {
  feed: FeedItem[];
  months: string[];
  monthFloat: number;
}

const VISIBLE = 9;

// Real dispatch feed — actual offenses stream in on their real dates. Nothing
// here is synthesized; each row is a sourced record (title + block + beat).
export const Feed: React.FC<Props> = ({ feed, months, monthFloat }) => {
  // Map each real incident date to a comparable month-float position.
  const withPos = useMemo(() => {
    const idxOf = new Map(months.map((m, i) => [m, i]));
    return feed
      .map((it) => {
        const ym = it.date.slice(0, 7);
        const mi = idxOf.get(ym);
        if (mi === undefined) return null;
        const day = Number(it.date.slice(8, 10)) || 1;
        return { it, pos: mi + (day - 1) / 31 };
      })
      .filter((x): x is { it: FeedItem; pos: number } => x !== null)
      .sort((a, b) => a.pos - b.pos);
  }, [feed, months]);

  const shown = useMemo(() => {
    const past = withPos.filter((x) => x.pos <= monthFloat);
    return past.slice(-VISIBLE).reverse();
  }, [withPos, monthFloat]);

  return (
    <div
      style={{
        position: "absolute",
        left: 34,
        top: 196,
        width: 372,
        fontFamily: FONT_MONO,
      }}
    >
      <div
        style={{
          fontSize: 13,
          letterSpacing: 3,
          color: COLORS.inkFaint,
          marginBottom: 12,
        }}
      >
        DISPATCH · SAMPLED REAL OFFENSES
      </div>
      {shown.map(({ it }, i) => (
        <div
          key={`${it.date}-${it.title}-${i}`}
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 12,
            opacity: Math.max(0.25, 1 - i * 0.09),
          }}
        >
          <span
            style={{
              marginTop: 5,
              width: 9,
              height: 9,
              borderRadius: 5,
              flex: "0 0 auto",
              background: CAT_COLORS[it.cat],
              boxShadow: `0 0 8px ${CAT_COLORS[it.cat]}`,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                color: COLORS.ink,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {it.title}
            </div>
            <div style={{ fontSize: 12.5, color: COLORS.inkFaint }}>
              {it.date} · {it.place} · {it.beat}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

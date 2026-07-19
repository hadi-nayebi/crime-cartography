#!/usr/bin/env node
/**
 * Render a channel-briefing markdown file (experiment/briefings/*.md) into an
 * email-safe HTML body (inline styles, table layout, light background — no
 * external assets, survives Gmail).
 *
 * Library:  import { renderBriefing } from "./render-briefing.mjs"
 *           renderBriefing(mdText) -> { subject, html, text }
 * CLI:      node pipeline/notify/render-briefing.mjs <briefing.md> [out.html]
 *           (writes HTML, prints the subject line to stdout)
 */
import { readFile, writeFile } from "node:fs/promises";

const GLYPHS = ["①", "②", "③", "④", "⑤", "⑥"];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Reflow hard-wrapped lines into paragraphs + bullets. */
function blocksOf(lines) {
  const blocks = []; // { kind: "p" | "li", text }
  let cur = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { cur = null; continue; }
    if (/^-\s+/.test(line.trim())) {
      cur = { kind: "li", text: line.trim().replace(/^-\s+/, "") };
      blocks.push(cur);
    } else if (cur) {
      cur.text += " " + line.trim(); // continuation of the wrapped line above
    } else {
      cur = { kind: "p", text: line.trim() };
      blocks.push(cur);
    }
  }
  return blocks;
}

function blocksHtml(blocks, { accent = "#111827" } = {}) {
  let html = "", listOpen = false;
  for (const b of blocks) {
    if (b.kind === "li" && !listOpen) { html += `<ul style="margin:8px 0 10px;padding-left:20px;">`; listOpen = true; }
    if (b.kind !== "li" && listOpen) { html += `</ul>`; listOpen = false; }
    if (b.kind === "li")
      html += `<li style="margin:0 0 6px;font-size:14px;line-height:1.55;color:${accent};">${esc(b.text)}</li>`;
    else
      html += `<p style="margin:8px 0;font-size:14px;line-height:1.55;color:${accent};">${esc(b.text)}</p>`;
  }
  if (listOpen) html += `</ul>`;
  return html;
}

export function renderBriefing(md) {
  const lines = md.split(/\r?\n/);
  const subjectLine = lines.find((l) => /^Subject:\s*/.test(l));
  const subject = subjectLine ? subjectLine.replace(/^Subject:\s*/, "").trim() : "Earth One · Channel Briefing";

  // Split into preamble + ①..⑥ sections.
  const sections = []; // { glyph, title, lines[] }
  let preamble = [], cur = null;
  for (const l of lines) {
    if (l === subjectLine) continue;
    const g = GLYPHS.find((g) => l.trimStart().startsWith(g));
    if (g) {
      const head = l.trim().slice(g.length).trim();
      cur = { glyph: g, title: head, lines: [] };
      sections.push(cur);
    } else if (cur) cur.lines.push(l);
    else preamble.push(l);
  }

  const dateBit = subject.replace(/^.*Briefing\s*·\s*/, "");
  const preBlocks = blocksOf(preamble);

  const sectionHtml = sections
    .map((s) => {
      const risky = s.glyph === "⑥";
      const body = blocksHtml(s.lines ? blocksOf(s.lines) : [], { accent: "#1f2937" });
      const inner = risky
        ? `<div style="background:#fff7ed;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:6px 14px;">${body}</div>`
        : body;
      return `
<tr><td style="padding:14px 28px 2px;">
  <div style="font-size:11px;letter-spacing:1.6px;font-weight:700;color:#6b7280;text-transform:uppercase;">${esc(s.glyph)}&nbsp; ${esc(s.title)}</div>
  ${inner}
</td></tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#eef1f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:28px 0;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:94%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;border:1px solid #e2e8f0;">
  <tr><td style="background:#0b1524;padding:22px 28px;">
    <div style="font-size:12px;letter-spacing:3px;font-weight:800;color:#34d399;">EARTH&nbsp;ONE</div>
    <div style="font-size:19px;font-weight:700;color:#ffffff;margin-top:4px;">Channel Briefing</div>
    <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${esc(dateBit)}</div>
  </td></tr>
  ${preBlocks.length ? `<tr><td style="padding:16px 28px 0;">${blocksHtml(preBlocks, { accent: "#6b7280" })}</td></tr>` : ""}
  ${sectionHtml}
  <tr><td style="padding:18px 28px 22px;">
    <div style="border-top:1px solid #e2e8f0;padding-top:12px;font-size:11px;line-height:1.6;color:#9ca3af;">
      Sent by the Crime Cartography production harness (send policy: earthone → hadinayebi only).<br>
      Repo copy: experiment/briefings/ · github.com/hadi-nayebi/crime-cartography
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text: md };
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const [src, out] = process.argv.slice(2);
  if (!src) { console.error("usage: render-briefing.mjs <briefing.md> [out.html]"); process.exit(1); }
  const { subject, html } = renderBriefing(await readFile(src, "utf8"));
  if (out) await writeFile(out, html);
  console.log(subject);
}

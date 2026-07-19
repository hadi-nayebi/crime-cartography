#!/usr/bin/env node
// Producer fact-sheet: recompute EVERY candidate on-screen number for a city
// from its normalized bundle, mirroring the surface's windowing/aggregation
// (last mapWindowMonths=60, Group A = persons+property+society, neighborhoods
// summed from member beats). Nothing trusted from builder reports.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const slug = process.argv[2];
const WIN = Number(process.argv[3] ?? 60);
const NORM = join("data", slug, "normalized");
const rd = (f) => JSON.parse(readFileSync(join(NORM, f), "utf8"));
const gA = (c) => c.persons + c.property + c.society;
const all = (c) => c.persons + c.property + c.society + c.other;
const fmt = (n) => Math.round(n).toLocaleString("en-US");

const timeline = rd("timeline.json");
const summary = rd("summary.json");
let trend = null, history = null, hoods = null;
try { trend = rd("trend.json"); } catch {}
try { history = rd("history.json"); } catch {}
try { hoods = rd("neighborhoods.json"); } catch {}

const months = timeline.months;
const N = months.length;
const s = N <= WIN ? 0 : N - WIN;
const wMonths = months.slice(s);
const cells = Object.fromEntries(Object.entries(timeline.cells).map(([k, v]) => [k, v.slice(s)]));
const hoodMap = hoods?.map ?? {};

console.log(`\n================= ${slug} =================`);
console.log(`timeline FULL: ${months[0]}..${months[N-1]} (${N} mo) | WINDOW(${WIN}): ${wMonths[0]}..${wMonths[wMonths.length-1]} (${wMonths.length} mo)`);
console.log(`summary: totalRecords=${fmt(summary.totalRecords)} placed=${fmt(summary.placedRecords)} coveragePct=${summary.coveragePct} beats=${summary.beatCount}`);
console.log(`catTotals(all-time): persons=${fmt(summary.catTotals.persons)} property=${fmt(summary.catTotals.property)} society=${fmt(summary.catTotals.society)} other=${fmt(summary.catTotals.other)}`);

// ---- TREND ----
if (trend) {
  const ys = trend.years;
  const peak = ys.reduce((a, b) => (b.total > a.total ? b : a));
  const fbi = ys.filter((y) => y.era === "fbi");
  const inc = ys.filter((y) => y.era === "incident");
  const fbiPeak = fbi.reduce((a, b) => (b.total > a.total ? b : a));
  console.log(`\nTREND: ${ys[0].year}..${ys[ys.length-1].year} seam=${trend.seamYear}${trend.seamGapYears?` GAP=${trend.seamGapYears.join(',')}`:''}`);
  console.log(`  eras: ${trend.eras.map(e=>e.key+' '+e.from+'-'+e.to).join(' | ')}`);
  console.log(`  FBI: first ${fbi[0].year}=${fmt(fbi[0].total)} | peak ${fbiPeak.year}=${fmt(fbiPeak.total)} | last(seam-1) ${fbi[fbi.length-1].year}=${fmt(fbi[fbi.length-1].total)}`);
  console.log(`  INC: first(seam) ${inc[0].year}=${fmt(inc[0].total)} | last ${inc[inc.length-1].year}=${fmt(inc[inc.length-1].total)}`);
  const pct = (a, b) => `${(((b - a) / a) * 100).toFixed(1)}%`;
  console.log(`  FALL peak->last-fbi: ${fbiPeak.year} ${fmt(fbiPeak.total)} -> ${fbi[fbi.length-1].year} ${fmt(fbi[fbi.length-1].total)} = ${pct(fbiPeak.total, fbi[fbi.length-1].total)}`);
  console.log(`  FALL first->last-fbi: ${fbi[0].year} ${fmt(fbi[0].total)} -> ${fbi[fbi.length-1].year} ${fmt(fbi[fbi.length-1].total)} = ${pct(fbi[0].total, fbi[fbi.length-1].total)}`);
  console.log(`  INC net first->last: ${inc[0].year} ${fmt(inc[0].total)} -> ${inc[inc.length-1].year} ${fmt(inc[inc.length-1].total)} = ${pct(inc[0].total, inc[inc.length-1].total)}`);
  const incPeak = inc.reduce((a,b)=>b.total>a.total?b:a); const incLow = inc.reduce((a,b)=>b.total<a.total?b:a);
  console.log(`  INC peak ${incPeak.year}=${fmt(incPeak.total)} | INC low ${incLow.year}=${fmt(incLow.total)}`);
  // fbi violent peak (parts)
  const fviol = fbi.filter(y=>y.parts?.violent!=null);
  if (fviol.length){ const vp=fviol.reduce((a,b)=>b.parts.violent>a.parts.violent?b:a); console.log(`  FBI violent peak: ${vp.year}=${fmt(vp.parts.violent)} (property ${fmt(vp.parts.property)})`); }
  console.log(`  FBI-era year table: ` + fbi.map(y=>`${y.year}:${y.total}`).join(' '));
}

// ---- WINDOW: citywide monthly Group A ----
const cityMonthly = wMonths.map((_, i) => {
  let p=0,pr=0,so=0,ot=0;
  for (const k of Object.keys(cells)) { const c=cells[k][i]; p+=c.persons; pr+=c.property; so+=c.society; ot+=c.other; }
  return { persons:p, property:pr, society:so, other:ot };
});
const monGA = cityMonthly.map(gA);
let bMax=-1,bIdx=0; monGA.forEach((v,i)=>{ if(v>bMax){bMax=v;bIdx=i;} });
console.log(`\nWINDOW citywide: busiest Group A month = ${wMonths[bIdx]} (${fmt(bMax)})`);
// per full calendar year in window
const yr = {};
wMonths.forEach((m,i)=>{ const y=m.slice(0,4); (yr[y]??=[]).push(i); });
const fullYears = Object.keys(yr).filter(y=>yr[y].length===12).sort();
console.log(`  full window years: ` + fullYears.map(y=>`${y}:${fmt(yr[y].reduce((a,i)=>a+monGA[i],0))}`).join(' '));
if (fullYears.length>=2){
  const y0=fullYears[0], y1=fullYears[fullYears.length-1];
  const t0=yr[y0].reduce((a,i)=>a+monGA[i],0), t1=yr[y1].reduce((a,i)=>a+monGA[i],0);
  console.log(`  citywide window ${y0}->${y1}: ${fmt(t0)} -> ${fmt(t1)} = ${(((t1-t0)/t0)*100).toFixed(1)}%`);
}

// ---- WINDOW: neighborhood aggregation (Group A) ----
const byHood = new Map();
for (const k of Object.keys(cells)) {
  const name = hoodMap[k]?.name ?? k;
  let h = byHood.get(name);
  if (!h){ h={name, keys:[], series:wMonths.map(()=>({persons:0,property:0,society:0,other:0}))}; byHood.set(name,h); }
  h.keys.push(k);
  for (let i=0;i<wMonths.length;i++){ const c=cells[k][i]; h.series[i].persons+=c.persons; h.series[i].property+=c.property; h.series[i].society+=c.society; h.series[i].other+=c.other; }
}
const hoodArr = [...byHood.values()].map(h=>({ name:h.name, keys:h.keys, ga: h.series.reduce((a,c)=>a+gA(c),0), series:h.series }));
hoodArr.sort((a,b)=>b.ga-a.ga);
console.log(`\nWINDOW neighborhoods (Group A, ${byHood.size} total): `);
console.log(`  BUSIEST top5: ` + hoodArr.slice(0,5).map(h=>`${h.name}=${fmt(h.ga)}`).join(' | '));
console.log(`  SAFEST bottom5: ` + hoodArr.slice(-5).map(h=>`${h.name}=${fmt(h.ga)}`).join(' | '));
// biggest change first-full-year -> last-full-year per hood (min base 100)
if (fullYears.length>=2){
  const y0=fullYears[0], y1=fullYears[fullYears.length-1];
  const chg = hoodArr.map(h=>{
    const t0=yr[y0].reduce((a,i)=>a+gA(h.series[i]),0), t1=yr[y1].reduce((a,i)=>a+gA(h.series[i]),0);
    return { name:h.name, t0, t1, pct: t0>0?((t1-t0)/t0)*100:null };
  }).filter(x=>x.t0>=100);
  const drops=[...chg].filter(x=>x.pct!=null).sort((a,b)=>a.pct-b.pct);
  const rises=[...chg].filter(x=>x.pct!=null).sort((a,b)=>b.pct-a.pct);
  console.log(`  biggest DROP ${y0}->${y1} (base>=100): ` + drops.slice(0,3).map(d=>`${d.name} ${d.t0}->${d.t1} ${d.pct.toFixed(1)}%`).join(' | '));
  console.log(`  biggest RISE ${y0}->${y1} (base>=100): ` + rises.slice(0,3).map(d=>`${d.name} ${d.t0}->${d.t1} ${d.pct.toFixed(1)}%`).join(' | '));
}

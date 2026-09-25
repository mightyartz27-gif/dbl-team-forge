// Rating Match tier list ingestion.
// Finds the newest "The Newest Rating Match Tier List Is Here!" news post on dblegends.net
// (a mirror of the official in-game notice), parses every tier, the bonus table and the
// LEGENDS LIMITED bonus, and writes src/data/generated/pvp.json.
// If anything fails, the previous pvp.json is kept, so the app never loses its tier data.
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://dblegends.net';
const OUT = path.resolve('src/data/generated/pvp.json');
const UA = 'DBL-Team-Forge-Ingest/1.0 (+community team builder; credits dblegends.net)';
const SCAN = Number(process.env.TIER_SCAN || 150); // how many news ids below the newest to check
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  return res.ok ? res.text() : null;
}

const TIER_KEYS = { Featured: 'featured', 'Tier Z': 'Z', 'Tier S': 'S', 'Tier A': 'A', 'Tier B': 'B', 'Tier C': 'C' };

export function parseTierPost(html, url) {
  if (!/Rating Match Tier List/i.test(html)) return null;
  const title = decode((html.match(/<h2 class='news-detail__title'>([\s\S]*?)<\/h2>/) || [])[1] || 'Rating Match Tier List');
  const start = decode((html.match(/season beginning on\s*<strong>([\s\S]*?)<\/strong>/) || [])[1] || '');
  const seasons = +((html.match(/apply for (\d+) season/) || [])[1] || 1);
  const listStart = html.indexOf('List of Tiers');
  const bonusStart = html.indexOf('Bonus Effect Sizes');
  if (listStart < 0 || bonusStart < 0) return null;
  const list = html.slice(listStart, bonusStart);

  const headers = {};
  for (const m of list.matchAll(/<tr class="Cl_(\d+)[^"]*"[^>]*><td colspan="4" class="tierHeader">([\s\S]*?)<\/td><\/tr>/g)) headers[m[1]] = TIER_KEYS[decode(m[2])];
  const tiers = {};
  for (const m of list.matchAll(/<tr class="tierCl_(\d+)">([\s\S]*?)<\/tr>/g)) {
    const tier = headers[m[1]];
    const code = (m[2].match(/>\s*(DBL[^<\s]+)\s*</) || [])[1];
    if (tier && code) tiers[code.toUpperCase()] = tier;
  }

  const bonusHtml = html.slice(bonusStart, html.indexOf('</table>', bonusStart));
  const pct = (txt, label) => { const m = txt.match(new RegExp(label + '[^+]*\\+(\\d+(?:\\.\\d+)?)\\s*[％%]')); return m ? +m[1] : 0; };
  const bonus = {};
  for (const row of bonusHtml.matchAll(/<tr><td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
    const tier = TIER_KEYS[decode(row[1])];
    if (!tier) continue;
    const side = (h) => ({ dmg: pct(h, 'Inflicted Damage UP'), guard: pct(h, 'Damage Guard UP'), llBonus: /LEGENDS LIMITED-Exclusive Bonus/i.test(h) });
    bonus[tier] = { pre: side(row[2]), post: side(row[3]) };
  }

  const llStart = html.indexOf('LEGENDS LIMITED-Exclusive Bonus</h1>');
  const llBands = [];
  if (llStart >= 0) {
    const llHtml = html.slice(llStart, html.indexOf('</table>', llStart));
    for (const r of llHtml.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
      const v = decode(r[2]).match(/\+(\d+(?:\.\d+)?)%/);
      if (v) llBands.push({ stars: decode(r[1]), value: +v[1] });
    }
  }
  if (Object.keys(tiers).length < 50 || Object.keys(bonus).length < 5) return null; // looks wrong: keep previous data
  return { source: 'Official Rating Match tier notice (via dblegends.net)', url, title, seasonStart: start, seasons, fetchedAt: new Date().toISOString(), bonus, llBands, tiers };
}

async function main() {
  let previous = null;
  try { previous = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch { /* first run */ }
  const index = await get(`${BASE}/news`);
  const ids = index ? [...index.matchAll(/news\/(\d+)/g)].map((m) => +m[1]) : [];
  const newest = Math.max(...ids, previous?.newsId ?? 0);
  const floor = Math.max(previous?.newsId ?? 0, newest - SCAN);
  console.log(`Scanning news ${newest} → ${floor} for the Rating Match tier list…`);
  let found = null;
  for (let id = newest; id >= floor && !found; id--) {
    const html = await get(`${BASE}/news/${id}`);
    await sleep(150);
    if (!html || !/<title>[^<]*Rating Match Tier List/i.test(html)) continue;
    const parsed = parseTierPost(html, `${BASE}/news/${id}`);
    if (parsed) found = { ...parsed, newsId: id };
  }
  if (!found) {
    console.log(previous ? `No newer tier post; keeping ${previous.url}` : 'No tier post found (PvP mode will be unavailable).');
    return;
  }
  if (previous && previous.newsId === found.newsId && JSON.stringify(previous.tiers) === JSON.stringify(found.tiers)) {
    console.log(`Tier list unchanged (${found.url}).`);
    return;
  }
  await fs.writeFile(OUT, JSON.stringify(found, null, 1));
  const counts = Object.values(found.tiers).reduce((a, t) => ((a[t] = (a[t] || 0) + 1), a), {});
  console.log(`Saved tier list from ${found.url}: season from ${found.seasonStart}`, counts);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error('Tier ingestion failed, keeping previous data:', e.message); });

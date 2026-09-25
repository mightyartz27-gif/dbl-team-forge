// Stage 1 of ingestion: download raw data from dblegends.net into .cache/raw.
// Polite by design: low concurrency, delay between requests, cached files are reused
// unless --refresh is passed. Only the JSON/HTML fragments we need are kept.
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://dblegends.net';
const RAW = path.resolve('.cache/raw');
const CONCURRENCY = Number(process.env.INGEST_CONCURRENCY || 3);
const DELAY_MS = Number(process.env.INGEST_DELAY_MS || 250);
const REFRESH = process.argv.includes('--refresh');
const UA = 'DBL-Team-Forge-Ingest/1.0 (+community team builder; credits dblegends.net)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url}: ${e.message}`);
      await sleep(1000 * (i + 1));
    }
  }
}

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function pool(items, fn) {
  let i = 0, done = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${items.length}`);
      await sleep(DELAY_MS);
    }
  });
  await Promise.all(workers);
}

function jsonBlocks(html, ids) {
  const out = {};
  for (const id of ids) {
    const m = html.match(new RegExp(`<script id="${id}"\\s+type="application/json">([\\s\\S]*?)</script>`));
    if (m) { try { out[id] = JSON.parse(m[1]); } catch { out[id] = null; } }
  }
  return out;
}

async function main() {
  await fs.mkdir(path.join(RAW, 'char'), { recursive: true });
  await fs.mkdir(path.join(RAW, 'equip'), { recursive: true });

  console.log('Fetching character list…');
  const listHtml = await get(`${BASE}/characters`);
  await fs.writeFile(path.join(RAW, 'characters.html'), listHtml);
  const charIds = [...new Set([...listHtml.matchAll(/href="character\/(\d+)" class="chara-list/g)].map((m) => m[1]))];
  console.log(`  ${charIds.length} characters listed`);

  console.log('Fetching equipment list…');
  const eqHtml = await get(`${BASE}/equipment`);
  await fs.writeFile(path.join(RAW, 'equipment.html'), eqHtml);
  const eqIds = [...new Set([...eqHtml.matchAll(/href="\/?equip\/(\d+)"/g)].map((m) => m[1]))];
  console.log(`  ${eqIds.length} equipment listed`);

  console.log('Fetching character pages…');
  await pool(charIds, async (id) => {
    const file = path.join(RAW, 'char', `${id}.json`);
    if (!REFRESH && (await exists(file))) return;
    const html = await get(`${BASE}/character/${id}`);
    if (!html) return;
    const blocks = jsonBlocks(html, ['data', 'ab', 'tr', 'mx']);
    await fs.writeFile(file, JSON.stringify(blocks));
  });

  console.log('Fetching equipment pages…');
  await pool(eqIds, async (id) => {
    const file = path.join(RAW, 'equip', `${id}.html`);
    if (!REFRESH && (await exists(file))) return;
    const html = await get(`${BASE}/equip/${id}`);
    if (!html) return;
    const start = html.indexOf('<div class="eqd-head">');
    const end = html.indexOf('DBLegends.net', start);
    await fs.writeFile(file, start >= 0 ? html.slice(start, end) : '');
  });

  await fs.writeFile(path.join(RAW, 'fetched_at.txt'), new Date().toISOString());
  console.log('Raw fetch complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });

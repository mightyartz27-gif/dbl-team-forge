// Stage 3 of ingestion: upsert the normalized snapshot into Supabase.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role bypasses RLS; never ship it to the browser).
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const DIR = path.resolve('src/data/generated');
const read = async (f) => JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8'));

async function upsert(table, rows, size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + size), { onConflict: 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`  ${table}: ${rows.length} rows`);
}

const [characters, equipment, tags, meta] = await Promise.all(['characters.json', 'equipment.json', 'tags.json', 'meta.json'].map(read));
console.log('Syncing to Supabase…');
await upsert('tags', tags.map((t) => ({ id: t.id, name: t.name, kind: t.kind })));
await upsert('characters', characters.map((c) => ({
  id: c.id, card_code: c.card, name: c.name, form_names: c.forms, rarity: c.rarity, legends_limited: c.lf,
  color: c.color, colors: c.colors, tag_ids: c.tags, has_zenkai: c.zenkai, icon: c.icon, base_stats: c.base,
  z_ability: c.z, zenkai_ability: c.zenkaiZ, assault_ability: c.assault, resonance: c.resonance, traits: c.traits,
  parse_warnings: c.warnings, data: c, source_url: `https://dblegends.net/character/${c.id}`, updated_at: new Date().toISOString(),
})), 100);
await upsert('equipment', equipment.map((e) => ({
  id: e.id, name: e.name, rarity: e.rarity, icon: e.icon, equip_conditions: e.equipConditions, eligible_character_ids: e.eligible,
  slots: e.slots, is_battle: e.battle, parse_warnings: e.warnings, data: e, source_url: `https://dblegends.net/equip/${e.id}`, updated_at: new Date().toISOString(),
})), 100);
// meta last: clients only switch to Supabase data once everything above is in place
const { error } = await sb.from('db_meta').upsert({ key: 'meta', value: meta, updated_at: new Date().toISOString() });
if (error) throw error;
console.log(`Done. Database version ${meta.builtAt}`);

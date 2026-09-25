import type { Character, DbMeta, Equipment, GameData, PvpData, Tag } from './types';
import { supabase } from '../lib/supabase';

/**
 * Game data loading strategy:
 * 1. The build bundles a snapshot (src/data/generated) — instant, works offline.
 * 2. If Supabase is configured and holds a newer database version, fetch that instead.
 * The UI never depends on where the data came from.
 */
async function bundled(): Promise<GameData> {
  const [c, e, t, m, p] = await Promise.all([
    import('./generated/characters.json'),
    import('./generated/equipment.json'),
    import('./generated/tags.json'),
    import('./generated/meta.json'),
    import('./generated/pvp.json').catch(() => ({ default: null })),
  ]);
  return { characters: c.default as unknown as Character[], equipment: e.default as unknown as Equipment[], tags: t.default as Tag[], meta: m.default as unknown as DbMeta, pvp: (p.default as unknown as PvpData) ?? null };
}

async function fetchAll<T>(table: string, columns = '*'): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function fromSupabase(localBuiltAt: string): Promise<GameData | null> {
  if (!supabase) return null;
  const { data: metaRow, error } = await supabase.from('db_meta').select('value').eq('key', 'meta').maybeSingle();
  if (error || !metaRow) return null;
  const meta = metaRow.value as DbMeta;
  if (meta.builtAt <= localBuiltAt) return null; // bundled snapshot is current
  const [chars, equips, tags] = await Promise.all([
    fetchAll<{ data: Character }>('characters', 'data'),
    fetchAll<{ data: Equipment }>('equipment', 'data'),
    fetchAll<Tag>('tags', 'id,name,kind'),
  ]);
  return { characters: chars.map((r) => r.data), equipment: equips.map((r) => r.data), tags, meta };
}

export async function loadGameData(): Promise<{ data: GameData; origin: 'bundled' | 'supabase' }> {
  const local = await bundled();
  try {
    const remote = await fromSupabase(local.meta.builtAt);
    if (remote) return { data: { ...remote, pvp: local.pvp }, origin: 'supabase' };
  } catch (e) {
    console.warn('Supabase unavailable, using bundled data', e);
  }
  return { data: local, origin: 'bundled' };
}

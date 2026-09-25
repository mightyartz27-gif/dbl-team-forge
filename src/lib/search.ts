import type { Character, Color } from '../data/types';
import type { Db } from '../engine/db';
import { tierKey, type TierFilterKey } from '../engine/pvp';

export interface CharFilter {
  q: string;
  rarity: Set<string>;   // 'ULTRA' | 'LL' | 'SPARKING' | 'EXTREME' | 'HERO' | 'LEGEND'
  colors: Set<Color>;
  zenkai: boolean;
  boxOnly: boolean;
  tag: number | null;
  tiers: Set<TierFilterKey>;
}
export const emptyFilter = (): CharFilter => ({ q: '', rarity: new Set(), colors: new Set(), zenkai: false, boxOnly: false, tag: null, tiers: new Set() });

export function searchChars(db: Db, f: CharFilter, box: Set<number>): Character[] {
  const q = f.q.trim().toLowerCase();
  const tagHits = q.length >= 3 ? new Set([...db.tags.values()].filter((t) => t.name.toLowerCase().includes(q)).map((t) => t.id)) : new Set<number>();
  const scored: [Character, number][] = [];
  for (const c of db.data.characters) {
    if (f.boxOnly && !box.has(c.id)) continue;
    if (f.zenkai && !c.zenkai) continue;
    if (f.colors.size && !c.colors.some((x) => f.colors.has(x))) continue;
    if (f.rarity.size) {
      const ok = (f.rarity.has('LL') && c.lf) || f.rarity.has(c.rarity);
      if (!ok) continue;
    }
    if (f.tag !== null && !c.tags.includes(f.tag)) continue;
    if (f.tiers.size && !f.tiers.has(tierKey(db, c.id))) continue;
    let score = 1;
    if (q) {
      const name = c.name.toLowerCase();
      score = 0;
      if (c.card.toLowerCase() === q || String(c.id) === q) score = 100;
      else if (name.startsWith(q)) score = 60;
      else if (name.includes(q)) score = 45;
      else if (c.forms.some((x) => x.toLowerCase().includes(q))) score = 35;
      else if (c.card.toLowerCase().includes(q)) score = 30;
      else if (c.tags.some((t) => tagHits.has(t))) score = 20;
      else if (q.length >= 4 && (c.z?.some((l) => l?.text.toLowerCase().includes(q)) || c.zenkaiZ?.some((l) => l?.text.toLowerCase().includes(q)))) score = 8;
      if (!score) continue;
    }
    // newer cards first within a score band
    scored.push([c, score * 10000 + c.id]);
  }
  return scored.sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}

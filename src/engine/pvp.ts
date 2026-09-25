import type { TierId } from '../data/types';
import type { Db } from './db';
import type { Member } from './zAbilities';

export const TIERS: TierId[] = ['featured', 'Z', 'S', 'A', 'B', 'C'];
export type TierFilterKey = TierId | 'unlisted';
export const TIER_LABEL: Record<TierFilterKey, string> = { featured: 'Featured', Z: 'Tier Z', S: 'Tier S', A: 'Tier A', B: 'Tier B', C: 'Tier C', unlisted: 'Not listed' };
export const TIER_SHORT: Record<TierFilterKey, string> = { featured: 'F', Z: 'Z', S: 'S', A: 'A', B: 'B', C: 'C', unlisted: '?' };
/** Default PvP selection: every tier that gives a bonus. */
export const DEFAULT_TIER_FILTER: TierFilterKey[] = ['featured', 'Z', 'S', 'A', 'B'];

export interface AppliedTierBonus { tier: TierId; dmg: number; guard: number; ll: number; zenkaiSide: boolean }

/**
 * Tier bonus a fighter gets in Rating Matches / Treasure Battles.
 * Zenkai Awakened characters get the smaller "after" values; characters that can't be
 * Zenkai Awakened always get the "before" values. The LEGENDS LIMITED bonus (base stats)
 * applies only where the tier grants it (Featured) and depends on the LL's stars.
 */
export function tierBonusFor(db: Db, m: Member, llBand = 1): AppliedTierBonus | null {
  const pvp = db.data.pvp;
  const tier = db.tierOf(m.charId);
  if (!pvp || !tier) return null;
  const c = db.char(m.charId);
  const post = c.zenkai && m.zenkai;
  const b = pvp.bonus[tier]?.[post ? 'post' : 'pre'];
  if (!b) return null;
  const ll = b.llBonus && c.lf ? pvp.llBands[Math.min(llBand, pvp.llBands.length - 1)]?.value ?? 0 : 0;
  return { tier, dmg: b.dmg, guard: b.guard, ll, zenkaiSide: post };
}

export function tierKey(db: Db, id: number): TierFilterKey { return db.tierOf(id) ?? 'unlisted'; }

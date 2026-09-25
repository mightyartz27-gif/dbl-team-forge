import type { Character, StatKey } from '../data/types';

/**
 * All optimization weights live here. None of these numbers are official game values:
 * they express what the optimizer should care about. Tune freely.
 */
export type Priority = 'balanced' | 'strike' | 'blast' | 'defense' | 'health' | 'zenkai' | 'zability' | 'damage' | 'tags';
export const PRIORITIES: { id: Priority; label: string; blurb: string }[] = [
  { id: 'balanced', label: 'Balanced', blurb: 'Offense, defense and Health in proportion.' },
  { id: 'zability', label: 'Z Ability', blurb: 'Most team-wide Z Ability stats on the fighters.' },
  { id: 'zenkai', label: 'Zenkai', blurb: 'Most Zenkai buffs that actually reach the fighters.' },
  { id: 'health', label: 'Health', blurb: 'Health first, then defense.' },
  { id: 'strike', label: 'Strike', blurb: 'Strike ATK and Strike damage.' },
  { id: 'blast', label: 'Blast', blurb: 'Blast ATK and Blast damage.' },
  { id: 'damage', label: 'Damage', blurb: 'Relevant ATK plus Damage Inflicted.' },
  { id: 'defense', label: 'Defense', blurb: 'Strike DEF, Blast DEF and Health.' },
  { id: 'tags', label: 'Tag synergy', blurb: 'Fighters sharing the most tags.' },
];

export type AttackType = 'strike' | 'blast' | 'mixed';
export function attackType(c: Character): AttackType {
  if (!c.base) return 'mixed';
  const r = c.base.sa / Math.max(1, c.base.ba);
  return r > 1.08 ? 'strike' : r < 0.93 ? 'blast' : 'mixed';
}

type W = Partial<Record<StatKey, number>>;
const BASE_W: W = { hp: 1.1, sd: 0.45, bd: 0.45, crit: 0.15, critDmg: 0.1, dmg: 0.8, dmgSpecial: 0.25, dmgUltimate: 0.2, dmgGuard: 0.4, dmgCut: 0.4, ki: 0.1, heal: 0.1, dmgStrikeArts: 0.2, dmgBlastArts: 0.2 };

export function statWeights(p: Priority, t: AttackType): W {
  const w: W = { ...BASE_W };
  const main = t === 'strike' ? 'sa' : 'ba';
  if (t === 'mixed') { w.sa = 0.6; w.ba = 0.6; w.dmgStrike = 0.35; w.dmgBlast = 0.35; }
  else { w[main] = 1; w[main === 'sa' ? 'ba' : 'sa'] = 0.2; w[t === 'strike' ? 'dmgStrike' : 'dmgBlast'] = 0.6; }
  switch (p) {
    case 'strike': w.sa = 1.4; w.ba = 0.1; w.dmgStrike = 0.9; break;
    case 'blast': w.ba = 1.4; w.sa = 0.1; w.dmgBlast = 0.9; break;
    case 'defense': w.sd = 1.2; w.bd = 1.2; w.hp = 1.3; w.sa = (w.sa ?? 0) * 0.4; w.ba = (w.ba ?? 0) * 0.4; w.dmgGuard = 0.9; w.dmgCut = 0.9; break;
    case 'health': w.hp = 2.4; w.sd = 0.6; w.bd = 0.6; break;
    case 'damage': w.dmg = 1.5; w.dmgSpecial = 0.5; w.dmgUltimate = 0.4; break;
  }
  return w;
}

/** Weight of each score component per priority. */
export interface ComponentWeights {
  battleSynergy: number; zEfficiency: number; zenkaiEfficiency: number; healthSupport: number;
  offense: number; defense: number; equipment: number; coverage: number; leaderEfficiency: number; locked: number;
}
const CW_BASE: ComponentWeights = { battleSynergy: 0.7, zEfficiency: 1, zenkaiEfficiency: 0.8, healthSupport: 0.9, offense: 0.8, defense: 0.6, equipment: 0.5, coverage: 0.6, leaderEfficiency: 0.3, locked: 1 };
export function componentWeights(p: Priority): ComponentWeights {
  const w = { ...CW_BASE };
  switch (p) {
    case 'zability': w.zEfficiency = 2.2; w.coverage = 1.2; break;
    case 'zenkai': w.zenkaiEfficiency = 2.4; break;
    case 'health': w.healthSupport = 2.4; w.defense = 1; break;
    case 'strike': case 'blast': case 'damage': w.offense = 2.2; w.defense = 0.3; break;
    case 'defense': w.defense = 2.2; w.healthSupport = 1.4; w.offense = 0.3; break;
    case 'tags': w.battleSynergy = 2.6; w.coverage = 1.2; break;
  }
  return w;
}

/** Search-time multipliers per ability source (cheap objective used before full evaluation). */
export function sourceWeights(p: Priority): { z: number; zenkai: number; assault: number; synergy: number } {
  return {
    z: p === 'zability' ? 1.5 : 1,
    zenkai: p === 'zenkai' ? 2.5 : 1,
    assault: 1,
    synergy: p === 'tags' ? 60 : 12,
  };
}

/**
 * Normalization references. Components use a saturating curve 100·(1 − e^(−1.2·x/REF)),
 * so a value equal to REF scores ≈70 and differences near the top still count.
 * Calibrated on generated teams from the Sept 2026 database.
 */
export const REF = { z: 550, zenkai: 500, equipment: 450, health: 50, offense: 1200, defense: 500, leader: 350 };
export const saturate = (x: number, ref: number) => 100 * (1 - Math.exp((-1.2 * Math.max(0, x)) / ref));
export const WASTED_PENALTY = 3; // points per ability that reaches no fighter

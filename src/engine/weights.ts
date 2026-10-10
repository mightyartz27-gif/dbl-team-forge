import type { Character, StatKey } from '../data/types';

/**
 * All optimization weights live here. None of these numbers are official game values:
 * they express what the optimizer should care about. Tune freely.
 */
export type Priority = 'balanced' | 'abilitybonus' | 'cohesion' | 'strike' | 'blast' | 'defense' | 'health' | 'zenkai' | 'zability' | 'damage' | 'tags';
export const PRIORITIES: { id: Priority; label: string; blurb: string }[] = [
  { id: 'balanced', label: 'Balanced', blurb: 'Offense, defense and Health in proportion.' },
  { id: 'abilitybonus', label: 'Ability Bonus', blurb: 'Biggest total stacked bonus on the fighters: HP, ATK, DEF, Damage, Guard and Ki all count equally.' },
  { id: 'cohesion', label: 'Deck cohesion', blurb: "Fighters get their buffs on their own Strike/Blast side, so every ATK bonus lands on the cards they use." },
  { id: 'zability', label: 'Z Ability', blurb: "Most Z Ability stats on the fighters, weighted by each fighter's role (Zenkai and equipment don't count here)." },
  { id: 'zenkai', label: 'Zenkai', blurb: 'Most Zenkai buffs that actually reach the fighters.' },
  { id: 'health', label: 'Health', blurb: 'Health first, then defense.' },
  { id: 'strike', label: 'Strike', blurb: 'Strike ATK and Strike damage.' },
  { id: 'blast', label: 'Blast', blurb: 'Blast ATK and Blast damage.' },
  { id: 'damage', label: 'Damage', blurb: 'Relevant ATK plus Damage Inflicted.' },
  { id: 'defense', label: 'Defense', blurb: 'Strike DEF, Blast DEF and Health.' },
  { id: 'tags', label: 'Tag synergy', blurb: 'Fighters sharing the most tags.' },
];

export type AttackType = 'strike' | 'blast' | 'mixed';
/** Strike / Blast lean: a clear base-stat lean wins; otherwise the kit's own Strike/Blast boosts decide. */
export function attackType(c: Character): AttackType {
  if (c.base) {
    const r = c.base.sa / Math.max(1, c.base.ba);
    if (r > 1.08) return 'strike';
    if (r < 0.93) return 'blast';
  }
  const k = c.kitBias;
  if (k) {
    if (k.s >= k.b + 2 && k.s >= k.b * 1.5) return 'strike';
    if (k.b >= k.s + 2 && k.b >= k.s * 1.5) return 'blast';
  }
  return 'mixed';
}

type W = Partial<Record<StatKey, number>>;
const BASE_W: W = { hp: 1.1, sd: 0.45, bd: 0.45, crit: 0.15, critDmg: 0.1, dmg: 0.8, dmgSpecial: 0.25, dmgUltimate: 0.2, dmgGuard: 0.4, dmgCut: 0.4, ki: 0.1, heal: 0.1, dmgStrikeArts: 0.2, dmgBlastArts: 0.2 };

/** Analysis options shared by the generator and every team evaluation. */
export type Coverage = 'both' | 'strike' | 'blast';
export interface EvalOptions {
  /** which defense matters: against Strike, Blast, or both */
  coverage: Coverage;
  /** 0 = pure carry (team average), 1 = protect the weakest fighter; blended per component */
  floor: number;
  /** reward fighters whose Strike/Blast buffs match their own Strike/Blast stats */
  cohesion: boolean;
  /** search breadth */
  depth: 'quick' | 'thorough';
  /** give Zenkai Z Abilities extra weight when choosing the bench */
  zenkaiBench: boolean;
}
export const DEFAULT_EVAL: EvalOptions = { coverage: 'both', floor: 0.15, cohesion: true, depth: 'quick', zenkaiBench: true };
/** extra weight for Zenkai Z Abilities when 'Prefer Zenkai support' is on */
export const ZENKAI_PREFERENCE = 1.8;

export function statWeights(p: Priority, t: AttackType, coverage: Coverage = 'both'): W {
  const w: W = { ...BASE_W };
  const main = t === 'strike' ? 'sa' : 'ba';
  if (p === 'abilitybonus') {
    // exactly the stats summed by the Ability Bonus figure, all equal
    const ab: W = { hp: 1, sa: 1, ba: 1, sd: 1, bd: 1, dmg: 1, dmgGuard: 1, ki: 1 };
    if (coverage === 'strike') { ab.sd = 1.3; ab.bd = 0.7; }
    if (coverage === 'blast') { ab.bd = 1.3; ab.sd = 0.7; }
    return ab;
  }
  if (t === 'mixed') { w.sa = 0.6; w.ba = 0.6; w.dmgStrike = 0.35; w.dmgBlast = 0.35; }
  else { w[main] = 1; w[main === 'sa' ? 'ba' : 'sa'] = 0.2; w[t === 'strike' ? 'dmgStrike' : 'dmgBlast'] = 0.6; }
  switch (p) {
    case 'strike': w.sa = 1.4; w.ba = 0.1; w.dmgStrike = 0.9; break;
    case 'blast': w.ba = 1.4; w.sa = 0.1; w.dmgBlast = 0.9; break;
    case 'defense': w.sd = 1.2; w.bd = 1.2; w.hp = 1.3; w.sa = (w.sa ?? 0) * 0.4; w.ba = (w.ba ?? 0) * 0.4; w.dmgGuard = 0.9; w.dmgCut = 0.9; break;
    case 'health': w.hp = 2.4; w.sd = 0.6; w.bd = 0.6; break;
    case 'damage': w.dmg = 1.5; w.dmgSpecial = 0.5; w.dmgUltimate = 0.4; break;
    case 'cohesion':
      // only the fighter's own side counts; buffs on the other side count against it (they miss its cards)
      if (t === 'strike') { w.sa = 1.4; w.ba = -0.8; w.dmgStrike = 0.9; w.dmgBlast = -0.8; }
      else if (t === 'blast') { w.ba = 1.4; w.sa = -0.8; w.dmgBlast = 0.9; w.dmgStrike = -0.8; }
      break;
  }
  if (coverage === 'strike') { w.sd = (w.sd ?? 0) * 1.8; w.bd = (w.bd ?? 0) * 0.25; }
  if (coverage === 'blast') { w.bd = (w.bd ?? 0) * 1.8; w.sd = (w.sd ?? 0) * 0.25; }
  return w;
}

/** Weight of each score component per priority. */
export interface ComponentWeights {
  battleSynergy: number; zEfficiency: number; zenkaiEfficiency: number; healthSupport: number;
  offense: number; defense: number; equipment: number; coverage: number; leaderEfficiency: number; locked: number; cohesion: number; abilityBonus: number;
}
const CW_BASE: ComponentWeights = { battleSynergy: 0.7, zEfficiency: 1, zenkaiEfficiency: 0.8, healthSupport: 0.9, offense: 0.8, defense: 0.6, equipment: 0.5, coverage: 0.6, leaderEfficiency: 0.3, locked: 1, cohesion: 0.8, abilityBonus: 0 };
export function componentWeights(p: Priority): ComponentWeights {
  const w = { ...CW_BASE };
  switch (p) {
    case 'zability': w.zEfficiency = 2.2; w.coverage = 1.2; break;
    case 'zenkai': w.zenkaiEfficiency = 2.4; break;
    case 'health': w.healthSupport = 2.4; w.defense = 1; break;
    case 'strike': case 'blast': case 'damage': w.offense = 2.2; w.defense = 0.3; break;
    case 'defense': w.defense = 2.2; w.healthSupport = 1.4; w.offense = 0.3; break;
    case 'tags': w.battleSynergy = 2.6; w.coverage = 1.2; break;
    case 'abilitybonus': w.abilityBonus = 3.2; w.zEfficiency = 1.2; w.zenkaiEfficiency = 1; w.coverage = 1; break;
    case 'cohesion': w.cohesion = 4; w.offense = 1.2; w.battleSynergy = 0.4; break;
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
export const REF = { z: 550, zenkai: 500, equipment: 450, health: 50, offense: 1200, defense: 500, leader: 350, offenseRating: 2600, defenseRating: 1100, abilityBonus: 1500, abilityBonusRating: 2200 };
export const saturate = (x: number, ref: number) => 100 * (1 - Math.exp((-1.2 * Math.max(0, x)) / ref));
export const WASTED_PENALTY = 3; // points per ability that reaches no fighter

import type { Layer, StatKey } from '../data/types';
import type { Db } from './db';
import { equipBonuses, evalEquip, type LineEval } from './equipment';
import { tierBonusFor, type AppliedTierBonus } from './pvp';
import { propagate, type Application, type Team } from './zAbilities';

export const CORE_STATS: StatKey[] = ['hp', 'sa', 'ba', 'sd', 'bd'];
export const EXTRA_STATS: StatKey[] = ['crit', 'critDmg', 'ki', 'heal', 'dmg', 'dmgStrike', 'dmgBlast', 'dmgSpecial', 'dmgUltimate', 'dmgStrikeArts', 'dmgBlastArts', 'dmgGuard', 'dmgCut'];
export const STAT_LABEL: Record<StatKey, string> = {
  hp: 'Health', sa: 'Strike ATK', ba: 'Blast ATK', sd: 'Strike DEF', bd: 'Blast DEF',
  crit: 'Critical', critDmg: 'Critical damage', ki: 'Ki Recovery', heal: 'Health Restoration',
  dmg: 'Damage Inflicted', dmgStrike: 'Strike damage', dmgBlast: 'Blast damage', dmgSpecial: 'Special Move damage',
  dmgUltimate: 'Ultimate damage', dmgStrikeArts: 'Strike Arts damage', dmgBlastArts: 'Blast Arts damage',
  dmgGuard: 'Damage Guard', dmgCut: 'Sustained Damage CUT',
};

export type Bucket = Record<Layer, number>;
const bucket = (): Bucket => ({ base: 0, pure: 0, direct: 0 });
export type Source = 'z' | 'zenkai' | 'assault' | 'equip' | 'tier';

export interface StatLine {
  bySource: Record<Source, Bucket>;
  total: Bucket;
  /** (1+base)(1+pure)(1+direct) − 1, in percent */
  final: number;
}
export interface MemberSheet {
  slot: number;
  stats: Record<StatKey, StatLine>;
  equip: LineEval[][];
  /** effective offensive multiplier for Strike and Blast, including Damage Inflicted (direct layer), percent */
  offense: { strike: number; blast: number };
  /** effective defense: DEF stat combined with Damage Guard, percent */
  defense: { strike: number; blast: number };
  /** Rating Match tier bonus applied to this member (fighters in rating mode only) */
  tier: AppliedTierBonus | null;
  /** received / available Z-Ability value (0..1): how much of the team's Z output reaches this member */
  coverage: number;
  zenkaiReceived: number;
}
export interface TeamSheet {
  members: (MemberSheet | null)[];
  applications: Application[];
}

function emptyStats(): Record<StatKey, StatLine> {
  const o = {} as Record<StatKey, StatLine>;
  for (const k of [...CORE_STATS, ...EXTRA_STATS]) {
    o[k] = { bySource: { z: bucket(), zenkai: bucket(), assault: bucket(), equip: bucket(), tier: bucket() }, total: bucket(), final: 0 };
  }
  return o;
}

export function computeSheet(team: Team, db: Db): TeamSheet {
  const applications = propagate(team, db);
  const members: (MemberSheet | null)[] = team.slots.map((m, slot) => {
    if (!m) return null;
    const stats = emptyStats();
    let available = 0, received = 0;
    const zenkaiGivers = new Set<number>();
    for (const a of applications) {
      if (a.recipient !== slot) continue;
      const mag = a.line.stats.reduce((s, v) => s + v.value, 0);
      if (a.source !== 'assault' || a.reason !== 'assault-bench') available += mag;
      if (!a.applied) continue;
      received += mag;
      if (a.source === 'zenkai') zenkaiGivers.add(a.giver);
      for (const v of a.line.stats) stats[v.stat].bySource[a.source][v.layer] += v.value;
    }
    const equip = m.equipment.map((e) => (e ? evalEquip(team, slot, e, db) : []));
    for (const evals of equip) for (const b of equipBonuses(evals)) stats[b.stat].bySource.equip[b.layer] += b.value;
    const tier = team.ruleset === 'rating' && slot < 3 ? tierBonusFor(db, m, team.llBand) : null;
    if (tier) {
      stats.dmg.bySource.tier.direct += tier.dmg;
      stats.dmgGuard.bySource.tier.direct += tier.guard;
      if (tier.ll) for (const k of ['hp', 'sa', 'ba', 'sd', 'bd', 'crit'] as StatKey[]) stats[k].bySource.tier.base += tier.ll;
    }
    for (const k of Object.keys(stats) as StatKey[]) {
      const s = stats[k];
      for (const src of Object.values(s.bySource)) { s.total.base += src.base; s.total.pure += src.pure; s.total.direct += src.direct; }
      s.final = ((1 + s.total.base / 100) * (1 + s.total.pure / 100) * (1 + s.total.direct / 100) - 1) * 100;
    }
    const dmgAll = stats.dmg.total.base + stats.dmg.total.pure + stats.dmg.total.direct;
    const dmgS = dmgAll + stats.dmgStrike.total.direct + stats.dmgStrike.total.pure;
    const dmgB = dmgAll + stats.dmgBlast.total.direct + stats.dmgBlast.total.pure;
    const off = (st: StatLine, d: number) => ((1 + st.total.base / 100) * (1 + st.total.pure / 100) * (1 + d / 100) - 1) * 100;
    const guard = stats.dmgGuard.total.base + stats.dmgGuard.total.pure + stats.dmgGuard.total.direct;
    return {
      slot, stats, equip, tier,
      offense: { strike: off(stats.sa, dmgS), blast: off(stats.ba, dmgB) },
      defense: { strike: off(stats.sd, guard), blast: off(stats.bd, guard) },
      coverage: available > 0 ? received / available : 1,
      zenkaiReceived: zenkaiGivers.size,
    };
  });
  return { members, applications };
}

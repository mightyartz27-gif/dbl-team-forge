import type { StatKey } from '../data/types';
import type { Db } from './db';
import { computeSheet, type MemberSheet, type Source, type TeamSheet } from './stats';
import { abilitiesOf, BATTLE, type Team, type ZSource } from './zAbilities';
import { attackType, componentWeights, DEFAULT_EVAL, REF, saturate, ZENKAI_PREFERENCE, statWeights, WASTED_PENALTY, type AttackType, type ComponentWeights, type EvalOptions, type Priority } from './weights';

export const SYNERGY_TAG_KINDS = new Set(['class', 'episode', 'character']);

export interface AbilityUse {
  giver: number;
  source: ZSource;
  name: string;
  /** battle slots receiving at least part of it */
  reaches: number[];
  /** per battle slot: fraction (0..1) of the ability's lines received */
  fraction: Record<number, number>;
  wasted: boolean;
  givesHealth: boolean;
}

export interface Uncalculated { slot: number; label: string; detail: string }

/** Stats shown in the "stacked output" table (sum of every source and layer). */
export const STACK_STATS: StatKey[] = ['hp', 'sa', 'ba', 'sd', 'bd', 'dmg', 'dmgGuard', 'ki'];
export interface Stacked { slot: number; style: AttackType; total: number; stats: Record<string, number>; cohesion: number }

/** Letter grade for the optimizer score (internal metric, not a game rank). */
export function grade(score: number): string {
  return score >= 85 ? 'S+' : score >= 75 ? 'S' : score >= 65 ? 'A' : score >= 55 ? 'B' : score >= 45 ? 'C' : 'D';
}

export interface TeamEval {
  sheet: TeamSheet;
  components: Record<keyof ComponentWeights, number>;
  overall: number;
  penalty: number;
  metrics: {
    health: number; strike: number; blast: number; strikeDef: number; blastDef: number;
    zHealth: number; zStrike: number; zBlast: number; zStrikeDef: number; zBlastDef: number;
    zenkaiActive: number; healthBuffs: number; wasted: number;
    tierDmg: number; tierGuard: number; tiers: (string | null)[];
    equipActive: number; equipConditional: number; equipPieces: number;
    coverage: number[];
    sharedTags: { id: number; count: number }[];
    /** sum of every fighter's stacked TOTAL */
    abilityBonus: number;
    /** same sum over all six members (fighters + bench), the way many community tools count it */
    abilityBonusTeam: number;
    stacked: Stacked[];
    styles: { strike: number; blast: number; mixed: number };
    grade: string;
  };
  abilities: AbilityUse[];
  uncalculated: Uncalculated[];
}

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

export function weightedGain(ms: MemberSheet, team: Team, db: Db, p: Priority, sources: Source[], opts: EvalOptions = DEFAULT_EVAL): number {
  const c = db.char(team.slots[ms.slot]!.charId);
  const w = statWeights(p, attackType(c), opts.coverage);
  let s = 0;
  for (const [k, wt] of Object.entries(w) as [StatKey, number][]) {
    const line = ms.stats[k];
    for (const src of sources) { const b = line.bySource[src]; s += wt * (b.base + b.pure + b.direct); }
  }
  return s;
}

function relevantOffense(ms: MemberSheet, team: Team, db: Db): number {
  const t = attackType(db.char(team.slots[ms.slot]!.charId));
  return t === 'strike' ? ms.offense.strike : t === 'blast' ? ms.offense.blast : (ms.offense.strike + ms.offense.blast) / 2;
}

export function sharedTags(team: Team, db: Db): { id: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const i of BATTLE) {
    const m = team.slots[i];
    if (!m) continue;
    for (const t of db.char(m.charId).tags) {
      const kind = db.tags.get(t)?.kind;
      if (kind && SYNERGY_TAG_KINDS.has(kind)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts].filter(([, n]) => n >= 2).map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
}

export function synergyScore(shared: { count: number }[]): number {
  return clamp(shared.reduce((s, t) => s + (t.count >= 3 ? 25 : 6), 0));
}

/** How well a fighter's ATK buffs line up with its own Strike/Blast stats (0..1). */
function cohesionOf(ms: MemberSheet, style: AttackType): number {
  const sum = (k: StatKey) => { const t = ms.stats[k].total; return t.base + t.pure + t.direct; };
  const s = Math.max(0, sum('sa') + sum('dmgStrike') + sum('dmgStrikeArts'));
  const b = Math.max(0, sum('ba') + sum('dmgBlast') + sum('dmgBlastArts'));
  if (s + b <= 0) return 0.5;
  if (style === 'strike') return s / (s + b);
  if (style === 'blast') return b / (s + b);
  return 1 - Math.abs(s - b) / (s + b);
}

export function evaluateTeam(team: Team, db: Db, p: Priority, lockedIds: number[] = [], opts: EvalOptions = DEFAULT_EVAL): TeamEval {
  const sheet = computeSheet(team, db);
  const battle = BATTLE.map((i) => sheet.members[i]).filter((m): m is MemberSheet => !!m);
  const n = Math.max(1, battle.length);
  const mean = (f: (m: MemberSheet) => number) => battle.reduce((s, m) => s + f(m), 0) / n;
  // "Team balance": blend the team average with the weakest fighter
  const avg = (f: (m: MemberSheet) => number) => {
    if (!battle.length) return 0;
    const lo = Math.min(...battle.map(f));
    return (1 - opts.floor) * mean(f) + opts.floor * lo;
  };

  // ability usage (for tree, wasted, Zenkai count)
  const abilities: AbilityUse[] = [];
  team.slots.forEach((m, g) => {
    if (!m) return;
    for (const ab of abilitiesOf(m, db)) {
      const fraction: Record<number, number> = {};
      const reaches: number[] = [];
      for (const r of BATTLE) {
        if (!team.slots[r]) continue;
        const apps = sheet.applications.filter((a) => a.giver === g && a.recipient === r && a.source === ab.source);
        if (!apps.length) continue;
        const tot = apps.reduce((s, a) => s + a.line.stats.reduce((x, v) => x + v.value, 0), 0);
        const got = apps.filter((a) => a.applied).reduce((s, a) => s + a.line.stats.reduce((x, v) => x + v.value, 0), 0);
        fraction[r] = tot ? got / tot : 0;
        if (got > 0) reaches.push(r);
      }
      const givesHealth = ab.level.lines.some((l) => l.stats.some((s) => s.stat === 'hp')) &&
        sheet.applications.some((a) => a.giver === g && a.source === ab.source && a.applied && a.recipient < 3 && a.line.stats.some((s) => s.stat === 'hp'));
      abilities.push({ giver: g, source: ab.source, name: ab.level.name, reaches, fraction, wasted: reaches.length === 0 && ab.level.lines.length > 0 && !(ab.source === 'assault' && g >= 3), givesHealth });
    }
  });

  const zSources: Source[] = ['z', 'assault'];
  const zVal = avg((m) => weightedGain(m, team, db, p, zSources, opts));
  const zkVal = avg((m) => weightedGain(m, team, db, p, ['zenkai'], opts));
  const eqVal = avg((m) => weightedGain(m, team, db, p, ['equip'], opts));
  const hp = avg((m) => m.stats.hp.final);
  const off = avg((m) => relevantOffense(m, team, db));
  const def = avg((m) => (opts.coverage === 'strike' ? m.defense.strike : opts.coverage === 'blast' ? m.defense.blast : (m.defense.strike + m.defense.blast) / 2));
  const rating = team.ruleset === 'rating';
  const cov = battle.map((m) => m.coverage);

  let equipActive = 0, equipConditional = 0, equipPieces = 0;
  for (const m of battle) for (const evals of m.equip) {
    if (evals.length) equipPieces++;
    for (const e of evals) if (e.calculable && e.line.cond) { equipConditional++; if (e.active) equipActive++; }
  }

  // leader efficiency: value gained vs. the same team without a leader
  let leaderGain = 0;
  if (team.leader !== null) {
    const noLead = computeSheet({ ...team, leader: null }, db);
    const all: Source[] = ['z', 'zenkai', 'assault'];
    for (const i of BATTLE) {
      const a = sheet.members[i], b = noLead.members[i];
      if (a && b) leaderGain += weightedGain(a, team, db, p, all, opts) - weightedGain(b, team, db, p, all, opts);
    }
  }

  const shared = sharedTags(team, db);
  const lockedSlots = BATTLE.filter((i) => team.slots[i] && lockedIds.includes(team.slots[i]!.charId));
  const lockedCov = lockedSlots.length ? lockedSlots.reduce<number>((s, i) => s + (sheet.members[i]?.coverage ?? 0), 0) / lockedSlots.length : 1;

  const stacked: Stacked[] = battle.map((ms) => {
    const style = attackType(db.char(team.slots[ms.slot]!.charId));
    const stats: Record<string, number> = {};
    let total = 0;
    for (const k of STACK_STATS) { const t = ms.stats[k].total; stats[k] = t.base + t.pure + t.direct; total += stats[k]; }
    return { slot: ms.slot, style, total, stats, cohesion: cohesionOf(ms, style) };
  });
  const styles = { strike: 0, blast: 0, mixed: 0 };
  stacked.forEach((s) => { styles[s.style]++; });
  const cohesionVal = stacked.length ? stacked.reduce((s, x) => s + x.cohesion, 0) / stacked.length : 0;

  const components: Record<keyof ComponentWeights, number> = {
    battleSynergy: synergyScore(shared),
    zEfficiency: saturate(zVal, REF.z),
    zenkaiEfficiency: saturate(zkVal, REF.zenkai),
    healthSupport: saturate(hp, REF.health),
    offense: saturate(off, rating ? REF.offenseRating : REF.offense),
    defense: saturate(def, rating ? REF.defenseRating : REF.defense),
    equipment: clamp(saturate(eqVal, REF.equipment) * 0.7 + (equipConditional ? (equipActive / equipConditional) * 30 : 30)),
    coverage: clamp((cov.reduce((s, x) => s + x, 0) / Math.max(1, cov.length)) * 100),
    leaderEfficiency: saturate(leaderGain, REF.leader),
    locked: clamp(lockedCov * 100),
    cohesion: clamp(cohesionVal * 100),
    // Ability Bonus per fighter (blended with the weakest fighter like the other components)
    abilityBonus: saturate(stacked.length ? (1 - opts.floor) * (stacked.reduce((s, x) => s + x.total, 0) / stacked.length) + opts.floor * Math.min(...stacked.map((x) => x.total)) : 0, rating ? REF.abilityBonusRating : REF.abilityBonus),
  };
  const cw = componentWeights(p);
  if (!opts.cohesion && p !== 'cohesion') cw.cohesion = 0;
  if (opts.zenkaiBench) cw.zenkaiEfficiency *= ZENKAI_PREFERENCE;
  if (!lockedSlots.length) cw.locked = 0;
  const wsum = Object.values(cw).reduce((s, x) => s + x, 0);
  const wasted = abilities.filter((a) => a.wasted).length;
  const penalty = wasted * WASTED_PENALTY;
  const overall = clamp((Object.entries(components) as [keyof ComponentWeights, number][]).reduce((s, [k, v]) => s + v * cw[k], 0) / wsum - penalty);

  const sumSrc = (k: StatKey) => mean((m) => m.stats[k].bySource.z.base + m.stats[k].bySource.assault.base + m.stats[k].bySource.zenkai.base);
  return {
    sheet, components, overall, penalty, abilities,
    metrics: {
      health: mean((m) => m.stats.hp.final), strike: mean((m) => m.offense.strike), blast: mean((m) => m.offense.blast),
      strikeDef: mean((m) => m.stats.sd.final), blastDef: mean((m) => m.stats.bd.final),
      zHealth: sumSrc('hp'), zStrike: sumSrc('sa'), zBlast: sumSrc('ba'), zStrikeDef: sumSrc('sd'), zBlastDef: sumSrc('bd'),
      zenkaiActive: abilities.filter((a) => a.source === 'zenkai' && !a.wasted).length,
      tierDmg: mean((m) => m.tier?.dmg ?? 0), tierGuard: mean((m) => m.tier?.guard ?? 0),
      tiers: BATTLE.map((i) => (team.slots[i] ? db.tierOf(team.slots[i]!.charId) : null)),
      healthBuffs: abilities.filter((a) => a.givesHealth).length,
      wasted, equipActive, equipConditional, equipPieces, coverage: cov, sharedTags: shared,
      abilityBonus: stacked.reduce((s, x) => s + x.total, 0), stacked, styles, grade: grade(overall),
      abilityBonusTeam: sheet.members.reduce((s, ms) => s + (ms ? STACK_STATS.reduce((a, k) => { const t = ms.stats[k].total; return a + t.base + t.pure + t.direct; }, 0) : 0), 0),
    },
    uncalculated: collectUncalculated(team, db, sheet),
  };
}

function collectUncalculated(team: Team, db: Db, sheet: TeamSheet): Uncalculated[] {
  const out: Uncalculated[] = [];
  team.slots.forEach((m, slot) => {
    if (!m) return;
    const c = db.char(m.charId);
    if (slot < 3) {
      if (c.rarity === 'ULTRA') out.push({ slot, label: 'Power Resonance', detail: 'Triggers once battle starts; not included in totals.' });
      for (const t of c.traits) out.push({ slot, label: t.name, detail: t.text || 'Battle trait' });
      const ms = sheet.members[slot];
      ms?.equip.forEach((evals) => evals.filter((e) => !e.calculable).forEach((e) => out.push({ slot, label: 'Equipment effect', detail: e.line.raw })));
    }
    for (const ab of abilitiesOf(m, db)) {
      if (!ab.level.parsed) out.push({ slot, label: `${ab.level.name} (not calculated)`, detail: ab.level.text });
      ab.level.contextual?.forEach((x) => out.push({ slot, label: ab.level.name, detail: x }));
    }
  });
  return out;
}

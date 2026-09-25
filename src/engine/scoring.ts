import type { StatKey } from '../data/types';
import type { Db } from './db';
import { computeSheet, type MemberSheet, type Source, type TeamSheet } from './stats';
import { abilitiesOf, BATTLE, type Team, type ZSource } from './zAbilities';
import { attackType, componentWeights, REF, saturate, statWeights, WASTED_PENALTY, type ComponentWeights, type Priority } from './weights';

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
  };
  abilities: AbilityUse[];
  uncalculated: Uncalculated[];
}

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

export function weightedGain(ms: MemberSheet, team: Team, db: Db, p: Priority, sources: Source[]): number {
  const c = db.char(team.slots[ms.slot]!.charId);
  const w = statWeights(p, attackType(c));
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

export function evaluateTeam(team: Team, db: Db, p: Priority, lockedIds: number[] = []): TeamEval {
  const sheet = computeSheet(team, db);
  const battle = BATTLE.map((i) => sheet.members[i]).filter((m): m is MemberSheet => !!m);
  const n = Math.max(1, battle.length);
  const avg = (f: (m: MemberSheet) => number) => battle.reduce((s, m) => s + f(m), 0) / n;

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
  const zVal = avg((m) => weightedGain(m, team, db, p, zSources));
  const zkVal = avg((m) => weightedGain(m, team, db, p, ['zenkai']));
  const eqVal = avg((m) => weightedGain(m, team, db, p, ['equip']));
  const hp = avg((m) => m.stats.hp.final);
  const off = avg((m) => relevantOffense(m, team, db));
  const def = avg((m) => (m.defense.strike + m.defense.blast) / 2);
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
      if (a && b) leaderGain += weightedGain(a, team, db, p, all) - weightedGain(b, team, db, p, all);
    }
  }

  const shared = sharedTags(team, db);
  const lockedSlots = BATTLE.filter((i) => team.slots[i] && lockedIds.includes(team.slots[i]!.charId));
  const lockedCov = lockedSlots.length ? lockedSlots.reduce<number>((s, i) => s + (sheet.members[i]?.coverage ?? 0), 0) / lockedSlots.length : 1;

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
  };
  const cw = componentWeights(p);
  if (!lockedSlots.length) cw.locked = 0;
  const wsum = Object.values(cw).reduce((s, x) => s + x, 0);
  const wasted = abilities.filter((a) => a.wasted).length;
  const penalty = wasted * WASTED_PENALTY;
  const overall = clamp((Object.entries(components) as [keyof ComponentWeights, number][]).reduce((s, [k, v]) => s + v * cw[k], 0) / wsum - penalty);

  const sumSrc = (k: StatKey) => avg((m) => m.stats[k].bySource.z.base + m.stats[k].bySource.assault.base + m.stats[k].bySource.zenkai.base);
  return {
    sheet, components, overall, penalty, abilities,
    metrics: {
      health: hp, strike: avg((m) => m.offense.strike), blast: avg((m) => m.offense.blast),
      strikeDef: avg((m) => m.stats.sd.final), blastDef: avg((m) => m.stats.bd.final),
      zHealth: sumSrc('hp'), zStrike: sumSrc('sa'), zBlast: sumSrc('ba'), zStrikeDef: sumSrc('sd'), zBlastDef: sumSrc('bd'),
      zenkaiActive: abilities.filter((a) => a.source === 'zenkai' && !a.wasted).length,
      tierDmg: avg((m) => m.tier?.dmg ?? 0), tierGuard: avg((m) => m.tier?.guard ?? 0),
      tiers: BATTLE.map((i) => (team.slots[i] ? db.tierOf(team.slots[i]!.charId) : null)),
      healthBuffs: abilities.filter((a) => a.givesHealth).length,
      wasted, equipActive, equipConditional, equipPieces, coverage: cov, sharedTags: shared,
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

import type { StatKey } from '../data/types';
import type { Db } from './db';
import { conditionText } from './equipment';
import { withOptimizedEquipment } from './equipOptimizer';
import { SearchContext } from './generator';
import { TIER_LABEL, tierKey } from './pvp';
import { evaluateTeam, type TeamEval } from './scoring';
import { STAT_LABEL } from './stats';
import type { Priority } from './weights';
import { abilitiesOf, BATTLE, BENCH, matches, newMember, type Team } from './zAbilities';

const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x)}%`;

// ------------------------------------------------------------------ bench
export interface BenchOption {
  charId: number;
  useful: number;                 // weighted useful value to the fighters
  receivers: number[];            // battle slots receiving anything
  zenkai: boolean;                // provides an active Zenkai buff
  statTotals: Partial<Record<StatKey, number>>; // raw % summed across fighters
  health: number;
  reasons: string[];
  whyNot?: string;
}

/** Everything a character on the bench would give the three fighters (Leader privilege included). */
export function benchContribution(team: Team, charId: number, db: Db, ctx: SearchContext): BenchOption {
  const m = newMember(charId, db.char(charId));
  const statTotals: Partial<Record<StatKey, number>> = {};
  const receivers = new Set<number>();
  let zenkai = false;
  for (const ab of abilitiesOf(m, db)) {
    if (ab.source === 'assault') continue; // inactive on the bench
    for (const r of BATTLE) {
      const rm = team.slots[r];
      if (!rm) continue;
      const tags = db.tagSet(rm.charId);
      for (const line of ab.level.lines) {
        if (r === team.leader || matches(line.cond, tags)) {
          receivers.add(r);
          if (ab.source === 'zenkai') zenkai = true;
          for (const s of line.stats) statTotals[s.stat] = (statTotals[s.stat] ?? 0) + s.value;
        }
      }
    }
  }
  const trio = BATTLE.map((i) => team.slots[i]?.charId).filter((x): x is number => x !== undefined);
  const leaderId = team.leader !== null ? team.slots[team.leader]?.charId ?? null : null;
  const useful = trio.reduce((s, r) => s + ctx.V(charId, r, leaderId, false), 0);
  const reasons: string[] = [];
  const top = (Object.entries(statTotals) as [StatKey, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [k, v] of top) reasons.push(`+${Math.round(v)}% ${STAT_LABEL[k]} across fighters`);
  if (zenkai) reasons.push('Zenkai buff reaches the fighters');
  reasons.push(`Reaches ${receivers.size}/${trio.length} fighters`);
  return { charId, useful, receivers: [...receivers], zenkai, statTotals, health: statTotals.hp ?? 0, reasons };
}

export function benchRanking(team: Team, db: Db, p: Priority, pool: number[], limit = 10): { chosen: BenchOption[]; alternatives: BenchOption[] } {
  const ids = new Set(team.slots.filter(Boolean).map((m) => m!.charId));
  const ctx = new SearchContext(db, p, [...new Set([...pool, ...ids])], { ruleset: team.ruleset, llBand: team.llBand });
  const chosen = BENCH.map((i) => team.slots[i]).filter(Boolean).map((m) => benchContribution(team, m!.charId, db, ctx));
  const alts = pool.filter((id) => !ids.has(id)).map((id) => benchContribution(team, id, db, ctx)).filter((b) => b.useful > 0).sort((a, b) => b.useful - a.useful).slice(0, limit);
  const weakest = [...chosen].sort((a, b) => a.useful - b.useful)[0];
  for (const a of alts) {
    if (!weakest) break;
    if (a.useful > weakest.useful) { a.whyNot = `Gives more useful stats than ${db.char(weakest.charId).name} — consider swapping.`; continue; }
    const diffs: string[] = [];
    for (const k of ['hp', 'sa', 'ba', 'sd', 'bd'] as StatKey[]) {
      const d = (weakest.statTotals[k] ?? 0) - (a.statTotals[k] ?? 0);
      if (d > 10) diffs.push(`${Math.round(d)}% less ${STAT_LABEL[k]}`);
    }
    if (a.receivers.length < weakest.receivers.length) diffs.unshift(`reaches fewer fighters (${a.receivers.length} vs ${weakest.receivers.length})`);
    a.whyNot = `Compared to ${db.char(weakest.charId).name}: ${diffs.slice(0, 2).join(', ') || 'slightly lower weighted total for this priority'}.`;
  }
  return { chosen, alternatives: alts };
}

// ------------------------------------------------------------------ leader
export interface LeaderOption { slot: number; charId: number; evaluation: TeamEval; delta: Record<string, number> }
export function leaderComparison(team: Team, db: Db, p: Priority, locked: number[] = []): LeaderOption[] {
  const cur = evaluateTeam(team, db, p, locked);
  return BATTLE.filter((i) => team.slots[i]).map((slot) => {
    const e = evaluateTeam({ ...team, leader: slot }, db, p, locked);
    return {
      slot, charId: team.slots[slot]!.charId, evaluation: e,
      delta: {
        overall: e.overall - cur.overall, health: e.metrics.health - cur.metrics.health,
        strike: e.metrics.strike - cur.metrics.strike, blast: e.metrics.blast - cur.metrics.blast,
        strikeDef: e.metrics.strikeDef - cur.metrics.strikeDef, blastDef: e.metrics.blastDef - cur.metrics.blastDef,
        zenkai: e.metrics.zenkaiActive - cur.metrics.zenkaiActive,
        coverage: (avg(e.metrics.coverage) - avg(cur.metrics.coverage)) * 100,
      },
    };
  }).sort((a, b) => b.evaluation.overall - a.evaluation.overall);
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// ------------------------------------------------------------------ improve
export interface Problem { level: 'warn' | 'info'; text: string }
export interface Swap { slot: number; fromId: number | null; toId: number; team: Team; evaluation: TeamEval; gain: number }

export function diagnose(team: Team, ev: TeamEval, db: Db): Problem[] {
  const out: Problem[] = [];
  BATTLE.forEach((i) => {
    const m = team.slots[i];
    const ms = ev.sheet.members[i];
    if (!m) { out.push({ level: 'warn', text: `Battle slot ${i + 1} is empty.` }); return; }
    if (ms && ms.coverage < 0.6) out.push({ level: 'warn', text: `${db.char(m.charId).name} receives only ${Math.round(ms.coverage * 100)}% of available Z Abilities.` });
    const empty = m.equipment.filter((e) => !e).length;
    if (empty) out.push({ level: 'info', text: `${db.char(m.charId).name} has ${empty} empty equipment slot${empty > 1 ? 's' : ''}.` });
    ms?.equip.forEach((evals) => evals.forEach((e) => {
      if (e.calculable && e.line.cond && !e.active && e.missing) {
        out.push({ level: 'warn', text: `${db.char(m.charId).name}: equipment condition "${conditionText(e.line, db)}" is ${e.current}/${e.required} (missing ${e.missing}).` });
      }
    }));
  });
  for (const a of ev.abilities) {
    if (a.source === 'assault' && a.giver >= 3) { out.push({ level: 'info', text: `${db.char(team.slots[a.giver]!.charId).name} is on the bench, so its Assault Z Ability is inactive.` }); continue; }
    if (!a.wasted) continue;
    const who = db.char(team.slots[a.giver]!.charId).name;
    out.push({ level: 'warn', text: a.source === 'zenkai' ? `${who}'s Zenkai buff reaches no fighter.` : `${who}'s ${a.name} reaches no fighter.` });
  }
  if (team.ruleset === 'rating' && db.data.pvp) {
    BATTLE.forEach((i) => {
      const m = team.slots[i];
      if (!m) return;
      const t = tierKey(db, m.charId), name = db.char(m.charId).name;
      if (t === 'C') out.push({ level: 'warn', text: `${name} is Tier C: no Rating Match tier bonus.` });
      if (t === 'unlisted') out.push({ level: 'info', text: `${name} isn't on the published tier list; check its tier in game.` });
      const tb = ev.sheet.members[i]?.tier;
      if (tb?.zenkaiSide && tb.tier !== 'C') out.push({ level: 'info', text: `${name} is Zenkai Awakened, so it gets the smaller ${TIER_LABEL[tb.tier]} bonus (+${tb.dmg}% damage).` });
    });
    BENCH.forEach((i) => {
      const m = team.slots[i];
      if (!m) return;
      const t = tierKey(db, m.charId);
      if (t === 'Z' || t === 'S') out.push({ level: 'info', text: `${db.char(m.charId).name} is ${TIER_LABEL[t]} but on the bench; tier bonuses only apply while fighting.` });
    });
  }
  if (team.leader === null && team.slots.slice(0, 3).some(Boolean)) out.push({ level: 'warn', text: 'No Leader set: the Leader privilege is unused.' });
  if (ev.metrics.healthBuffs === 0) out.push({ level: 'info', text: 'No Health Z Ability reaches the fighters.' });
  return out;
}

/** Best single replacements, ranked by overall score gain. Locked characters are never replaced. */
export function suggestSwaps(team: Team, db: Db, p: Priority, pool: number[], locked: number[], limit = 4, fighterPool?: number[]): Swap[] {
  const cur = evaluateTeam(team, db, p, locked);
  const inTeam = new Set(team.slots.filter(Boolean).map((m) => m!.charId));
  const ctx = new SearchContext(db, p, [...new Set([...pool, ...inTeam])], { ruleset: team.ruleset, llBand: team.llBand });
  const fighterSet = fighterPool ? new Set(fighterPool) : null;
  const trio = BATTLE.map((i) => team.slots[i]?.charId).filter((x): x is number => x !== undefined);
  const leaderId = team.leader !== null ? team.slots[team.leader]?.charId ?? null : null;
  const free = pool.filter((id) => !inTeam.has(id));
  const swaps: Swap[] = [];
  const tryPut = (slot: number, toId: number) => {
    const slots = team.slots.map((m, i) => (i === slot ? newMember(toId, db.char(toId)) : m));
    let t: Team = { ...team, slots };
    if (slot < 3) t = withOptimizedEquipment(t, db, p);
    const e = evaluateTeam(t, db, p, locked);
    swaps.push({ slot, fromId: team.slots[slot]?.charId ?? null, toId, team: t, evaluation: e, gain: e.overall - cur.overall });
  };
  for (const slot of BENCH) {
    const curId = team.slots[slot]?.charId;
    if (curId !== undefined && locked.includes(curId)) continue;
    const best = free.map((id) => [id, trio.reduce((s, r) => s + ctx.V(id, r, leaderId, false), 0)] as const).sort((a, b) => b[1] - a[1]).slice(0, 6);
    best.forEach(([id]) => tryPut(slot, id));
  }
  for (const slot of BATTLE) {
    const curId = team.slots[slot]?.charId;
    if (curId !== undefined && locked.includes(curId)) continue;
    const mates = trio.filter((x) => x !== curId);
    const best = free.filter((id) => !fighterSet || fighterSet.has(id)).map((id) => [id, mates.reduce((s, r) => s + ctx.R(id, r) + ctx.R(r, id), 0) + ctx.R(id, id) + ctx.pre.get(id)!.tierV] as const).sort((a, b) => b[1] - a[1]).slice(0, 6);
    best.forEach(([id]) => tryPut(slot, id));
  }
  const seen = new Set<string>();
  return swaps.filter((s) => s.gain > 0.2).sort((a, b) => b.gain - a.gain).filter((s) => { const k = `${s.slot}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
}

// ------------------------------------------------------------------ explanations
export interface Explanation { why: string[]; sacrifices: string[] }

export function explain(e: TeamEval, team: Team, db: Db, others: TeamEval[], focusIds: number[] = []): Explanation {
  const m = e.metrics;
  const why: string[] = [];
  why.push(`${pct(m.zStrike)} Base Strike ATK and ${pct(m.zBlast)} Base Blast ATK from Z Abilities (fighter average)`);
  why.push(`${pct(m.zStrikeDef)} Base Strike DEF, ${pct(m.zBlastDef)} Base Blast DEF, ${pct(m.zHealth)} Health`);
  if (team.ruleset === 'rating') {
    const parts = BATTLE.filter((i) => team.slots[i]).map((i) => {
      const tb = e.sheet.members[i]?.tier;
      return `${db.char(team.slots[i]!.charId).name} ${tb ? `${TIER_LABEL[tb.tier]} +${tb.dmg}% damage` : 'no tier bonus'}`;
    });
    why.push(`Rating Match tiers: ${parts.join('; ')}`);
  }
  why.push(`${m.zenkaiActive} Zenkai buff${m.zenkaiActive === 1 ? '' : 's'} active on the fighters`);
  BATTLE.forEach((i) => {
    const mm = team.slots[i];
    if (mm) why.push(`${Math.round(m.coverage[i] * 100)}% Z Ability coverage on ${db.char(mm.charId).name}`);
  });
  if (m.wasted === 0) why.push('0 wasted Z Abilities');
  if (m.equipConditional) why.push(`${m.equipActive}/${m.equipConditional} equipment conditions active`);
  if (m.sharedTags.length) why.push(`Shared tags: ${m.sharedTags.slice(0, 4).map((t) => `${db.tagName(t.id)} (${t.count}/3)`).join(', ')}`);

  const sacrifices: string[] = [];
  const cmp: [keyof typeof m, string][] = [['health', 'Health'], ['strike', 'Strike ATK'], ['blast', 'Blast ATK'], ['strikeDef', 'Strike DEF'], ['blastDef', 'Blast DEF']];
  for (const [k, label] of cmp) {
    const best = others.reduce<TeamEval | null>((b, o) => (!b || (o.metrics[k] as number) > (b.metrics[k] as number) ? o : b), null);
    if (best && best !== e) {
      const d = (best.metrics[k] as number) - (m[k] as number);
      if (d > 8) sacrifices.push(`${Math.round(d)}% less ${label} than the ${label}-best option`);
    }
  }
  if (m.wasted) sacrifices.push(`${m.wasted} Z Abilit${m.wasted === 1 ? 'y reaches' : 'ies reach'} no fighter`);
  const zkInactive = e.abilities.filter((a) => a.source === 'zenkai' && a.wasted).length;
  if (zkInactive) sacrifices.push(`${zkInactive} Zenkai buff${zkInactive > 1 ? 's' : ''} inactive`);
  BATTLE.forEach((i) => {
    const mm = team.slots[i];
    if (mm && focusIds.includes(mm.charId) && m.coverage[i] < 0.95) sacrifices.push(`${db.char(mm.charId).name} gets only partial Z coverage (${Math.round(m.coverage[i] * 100)}%)`);
  });
  if (m.equipConditional && m.equipActive < m.equipConditional) sacrifices.push(`${m.equipConditional - m.equipActive} equipment condition${m.equipConditional - m.equipActive > 1 ? 's' : ''} inactive`);
  return { why, sacrifices };
}

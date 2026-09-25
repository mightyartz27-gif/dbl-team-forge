import type { StatKey } from '../data/types';
import type { Db } from './db';
import { withOptimizedEquipment } from './equipOptimizer';
import { evaluateTeam, synergyScore, SYNERGY_TAG_KINDS, type TeamEval } from './scoring';
import { attackType, sourceWeights, statWeights, type AttackType, type Priority } from './weights';
import { tierBonusFor } from './pvp';
import { abilitiesOf, matches, newMember, type Team, type ZSource } from './zAbilities';

interface PreLine { source: ZSource; cond: number[][] | null; v: Record<AttackType, number> }
interface Pre { id: number; type: AttackType; tags: Set<number>; synTags: number[]; lines: PreLine[]; uncond: Record<AttackType, number>; uncondZ: Record<AttackType, number>; assault: Record<AttackType, number>; tierV: number }
export interface RulesetOptions { ruleset?: 'standard' | 'rating'; llBand?: number }

const TYPES: AttackType[] = ['strike', 'blast', 'mixed'];

/** Per-priority precomputation of every candidate's weighted ability lines. */
export class SearchContext {
  readonly pre = new Map<number, Pre>();
  private rCache = new Map<number, number>();
  constructor(readonly db: Db, readonly p: Priority, pool: number[], readonly rules: RulesetOptions = {}) {
    const sw = sourceWeights(p);
    const W = Object.fromEntries(TYPES.map((t) => [t, statWeights(p, t)])) as Record<AttackType, Partial<Record<StatKey, number>>>;
    for (const id of pool) {
      const c = db.char(id);
      const m = newMember(id, c);
      const lines: PreLine[] = [];
      const uncond = { strike: 0, blast: 0, mixed: 0 }, uncondZ = { strike: 0, blast: 0, mixed: 0 }, assault = { strike: 0, blast: 0, mixed: 0 };
      for (const ab of abilitiesOf(m, db)) {
        for (const l of ab.level.lines) {
          const v = { strike: 0, blast: 0, mixed: 0 };
          for (const t of TYPES) for (const s of l.stats) v[t] += (W[t][s.stat] ?? 0) * s.value * sw[ab.source];
          if (ab.source === 'assault') { for (const t of TYPES) assault[t] += v[t]; continue; }
          lines.push({ source: ab.source, cond: l.cond, v });
          for (const t of TYPES) { uncond[t] += v[t]; if (ab.source === 'z') uncondZ[t] += v[t]; }
        }
      }
      const synTags = c.tags.filter((t) => SYNERGY_TAG_KINDS.has(db.tags.get(t)?.kind ?? ''));
      // Rating Match tier bonus as a fighter. Damage Inflicted multiplies the whole ATK stack,
      // so it is scaled up here to be comparable with additive Z Ability points.
      let tierV = 0;
      if (rules.ruleset === 'rating') {
        const tb = tierBonusFor(db, m, rules.llBand);
        const w = W[attackType(c)];
        if (tb) tierV = (w.dmg ?? 0) * tb.dmg * 3 + (w.dmgGuard ?? 0) * tb.guard * 2 + tb.ll * ((w.hp ?? 0) + (w.sa ?? 0) + (w.ba ?? 0) + (w.sd ?? 0) + (w.bd ?? 0));
      }
      this.pre.set(id, { id, type: attackType(c), tags: db.tagSet(id), synTags, lines, uncond, uncondZ, assault, tierV });
    }
  }
  ensure(id: number) { if (!this.pre.has(id)) throw new Error(`not in pool ${id}`); }
  /** conditional value giver g hands to receiver r (no Leader privilege, no Assault) */
  R(g: number, r: number): number {
    const key = g * 100000 + r;
    const hit = this.rCache.get(key);
    if (hit !== undefined) return hit;
    const G = this.pre.get(g)!, Rc = this.pre.get(r)!;
    let s = 0;
    for (const l of G.lines) if (matches(l.cond, Rc.tags)) s += l.v[Rc.type];
    this.rCache.set(key, s);
    return s;
  }
  /** value g gives r in battle context, applying Leader rules and Assault (g is a battle member). */
  V(g: number, r: number, leader: number | null, gInBattle: boolean): number {
    const G = this.pre.get(g)!, Rc = this.pre.get(r)!;
    let s = 0;
    if (r === leader) s += G.uncond[Rc.type];
    else if (g === leader && gInBattle && g !== r) {
      // Leader's Z lines unconditional to trio mates; its Zenkai lines still conditional
      s += G.uncondZ[Rc.type];
      for (const l of G.lines) if (l.source === 'zenkai' && matches(l.cond, Rc.tags)) s += l.v[Rc.type];
    } else s += this.R(g, r);
    if (gInBattle && g !== r) s += G.assault[Rc.type];
    return s;
  }
  sharedSynergy(ids: number[]): number {
    const counts = new Map<number, number>();
    for (const id of ids) for (const t of this.pre.get(id)!.synTags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return synergyScore([...counts.values()].filter((n) => n >= 2).map((count) => ({ count })));
  }
}

export interface GenerateOptions {
  locked: number[];            // battle members that must stay
  lockedBench?: number[];      // bench members that must stay
  fighterPool?: number[];      // allowed fighters (e.g. PvP tier filter); defaults to pool
  ruleset?: 'standard' | 'rating';
  llBand?: number;
  pool: number[];              // allowed character ids (whole db or the user's box)
  priorities: Priority[];
  perPriority?: number;        // shortlist size to fully evaluate
  allowedEquipment?: Set<number>;
  onProgress?: (msg: string) => void;
  onResult?: (r: GeneratedTeam) => void;
}

export interface Candidate { trio: number[]; leader: number; bench: number[]; approx: number }
export interface GeneratedTeam { priority: Priority; team: Team; evaluation: TeamEval; candidateRank: number }

function topK<T>(items: T[], k: number, score: (x: T) => number): T[] {
  return items.map((x) => [x, score(x)] as const).sort((a, b) => b[1] - a[1]).slice(0, k).map((x) => x[0]);
}

function combos(arr: number[], k: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) { out.push([...acc]); return; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

/** Fast search: best (trio, leader, bench) candidates under one priority. */
export function searchCandidates(ctx: SearchContext, locked: number[], lockedBench: number[], pool: number[], keep: number, fighterPool?: number[]): Candidate[] {
  const sw = sourceWeights(ctx.p);
  const need = 3 - locked.length;
  const free = pool.filter((id) => !locked.includes(id) && !lockedBench.includes(id));
  const fighterSet = fighterPool ? new Set(fighterPool) : null;
  const freeFighters = fighterSet ? free.filter((id) => fighterSet.has(id)) : free;
  let trios: number[][];
  if (need <= 0) trios = [locked.slice(0, 3)];
  else {
    const K = need === 1 ? 90 : need === 2 ? 42 : 22;
    const affinity = (c: number) => {
      let s = ctx.R(c, c) * 0.6 + ctx.pre.get(c)!.assault.mixed * locked.length;
      for (const l of locked) s += ctx.R(c, l) + ctx.R(l, c);
      if (!locked.length) s += ctx.pre.get(c)!.uncond.mixed * 0.25;
      s += ctx.sharedSynergy([...locked, c]) * sw.synergy * 0.05;
      s += ctx.pre.get(c)!.tierV;
      return s;
    };
    const cand = topK(freeFighters, K, affinity);
    trios = combos(cand, need).map((x) => [...locked, ...x]);
  }

  // Dense matrices: bench candidate × receiver (every character that can be a fighter)
  const receivers = [...new Set(trios.flat())];
  const rIdx = new Map(receivers.map((r, i) => [r, i]));
  const benchPool = free;
  const nb = benchPool.length, nr = receivers.length;
  const Rm = new Float64Array(nb * nr);
  const Ut: Record<AttackType, Float64Array> = { strike: new Float64Array(nb), blast: new Float64Array(nb), mixed: new Float64Array(nb) };
  benchPool.forEach((b, bi) => {
    const B = ctx.pre.get(b)!;
    for (const t of TYPES) Ut[t][bi] = B.uncond[t];
    receivers.forEach((r, ri) => { Rm[bi * nr + ri] = b === r ? -1e9 : ctx.R(b, r); });
  });
  const lockedBenchVal = (trio: number[], leader: number) => {
    let v = 0;
    for (const b of lockedBench) for (const r of trio) v += ctx.V(b, r, leader, false);
    return v;
  };
  const openBench = 3 - lockedBench.length;
  const best: Candidate[] = [];
  const push = (c: Candidate) => {
    best.push(c);
    if (best.length > keep * 40) { best.sort((a, b) => b.approx - a.approx); best.length = keep * 10; }
  };
  const top = new Int32Array(3), topV = new Float64Array(3);
  for (const trio of trios) {
    const syn = ctx.sharedSynergy(trio) * sw.synergy / 10;
    const ri = trio.map((r) => rIdx.get(r)!);
    const inTrio = new Set(trio);
    for (let li = 0; li < trio.length; li++) {
      const leader = trio[li];
      const lt = ctx.pre.get(leader)!.type;
      let v = syn + lockedBenchVal(trio, leader);
      for (const g of trio) v += ctx.pre.get(g)!.tierV;
      for (const g of trio) for (const r of trio) v += ctx.V(g, r, leader, true);
      // O(n) top-k selection of bench marginals (exact: bench contributions are additive)
      top.fill(-1); topV.fill(-Infinity);
      if (openBench <= 0) { push({ trio, leader, bench: [...lockedBench], approx: v }); continue; }
      const U = Ut[lt];
      for (let bi = 0; bi < nb; bi++) {
        let m = U[bi];
        for (let k = 0; k < ri.length; k++) if (k !== li) m += Rm[bi * nr + ri[k]];
        if (m <= topV[openBench - 1] || m <= 0) continue;
        if (inTrio.has(benchPool[bi])) continue;
        let j = openBench - 1;
        while (j > 0 && topV[j - 1] < m) { topV[j] = topV[j - 1]; top[j] = top[j - 1]; j--; }
        topV[j] = m; top[j] = bi;
      }
      const picks: number[] = [];
      for (let k = 0; k < openBench; k++) if (top[k] >= 0) { picks.push(benchPool[top[k]]); v += topV[k]; }
      push({ trio, leader, bench: [...lockedBench, ...picks], approx: v });
    }
  }
  best.sort((a, b) => b.approx - a.approx);
  // de-duplicate identical six (keep best leader)
  const seen = new Set<string>();
  return best.filter((c) => {
    const k = [...c.trio].sort().join(',') + '|' + [...c.bench].sort().join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, keep);
}

export function buildTeam(c: Candidate, db: Db, rules: RulesetOptions = {}): Team {
  const slots = [...c.trio, ...c.bench].map((id) => (id !== undefined ? newMember(id, db.char(id)) : null));
  while (slots.length < 6) slots.push(null);
  return { slots, leader: c.trio.indexOf(c.leader), ruleset: rules.ruleset ?? 'standard', llBand: rules.llBand ?? 1 };
}

export const teamKey = (t: Team) => t.slots.map((m) => m?.charId ?? '-').join(',') + '@' + t.leader;

export function generateTeams(db: Db, o: GenerateOptions): GeneratedTeam[] {
  const pool = [...new Set([...o.pool, ...o.locked, ...(o.lockedBench ?? [])])].filter((id) => db.chars.has(id));
  const out: GeneratedTeam[] = [];
  const used = new Set<string>();
  const usedSix = new Set<string>();
  for (const p of o.priorities) {
    o.onProgress?.(`Searching ${p}…`);
    const rules = { ruleset: o.ruleset, llBand: o.llBand };
    const ctx = new SearchContext(db, p, pool, rules);
    const cands = searchCandidates(ctx, o.locked, o.lockedBench ?? [], pool, o.perPriority ?? 6, o.fighterPool);
    const evaluated = cands.map((c, i) => {
      const team = withOptimizedEquipment(buildTeam(c, db, rules), db, p, o.allowedEquipment);
      return { priority: p, team, evaluation: evaluateTeam(team, db, p, o.locked), candidateRank: i };
    }).sort((a, b) => b.evaluation.overall - a.evaluation.overall);
    const pick = evaluated.find((e) => !used.has(teamKey(e.team)) && !usedSix.has(sixKey(e.team))) ?? evaluated.find((e) => !used.has(teamKey(e.team)));
    if (pick) { used.add(teamKey(pick.team)); usedSix.add(sixKey(pick.team)); out.push(pick); o.onResult?.(pick); }
  }
  return out;
}

const sixKey = (t: Team) => t.slots.map((m) => m?.charId ?? '-').slice(0, 3).sort().join(',') + '|' + t.slots.slice(3).map((m) => m?.charId ?? '-').sort().join(',');

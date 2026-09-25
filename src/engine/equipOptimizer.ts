import type { Layer, StatKey } from '../data/types';
import type { Db } from './db';
import { evalEquip, equipBonuses } from './equipment';
import { computeSheet } from './stats';
import { attackType, statWeights, type Priority } from './weights';
import type { EquipChoice, Team } from './zAbilities';

type Buckets = Partial<Record<StatKey, Record<Layer, number>>>;

function objective(b: Buckets, w: Partial<Record<StatKey, number>>): number {
  let s = 0;
  for (const [k, wt] of Object.entries(w) as [StatKey, number][]) {
    const x = b[k];
    if (!x) continue;
    s += wt * ((1 + x.base / 100) * (1 + x.pure / 100) * (1 + x.direct / 100) - 1) * 100;
  }
  return s;
}

const fin = (x: Record<Layer, number>) => ((1 + x.base / 100) * (1 + x.pure / 100) * (1 + x.direct / 100) - 1) * 100;
function incrementalGain(b: Buckets, bonuses: { stat: StatKey; layer: Layer; value: number }[], w: Partial<Record<StatKey, number>>): number {
  const touched = new Map<StatKey, Record<Layer, number>>();
  for (const x of bonuses) {
    let t = touched.get(x.stat);
    if (!t) { const cur = b[x.stat] ?? { base: 0, pure: 0, direct: 0 }; t = { ...cur }; touched.set(x.stat, t); }
    t[x.layer] += x.value;
  }
  let g = 0;
  for (const [k, t] of touched) g += (w[k] ?? 0) * (fin(t) - fin(b[k] ?? { base: 0, pure: 0, direct: 0 }));
  return g;
}

function addTo(b: Buckets, stat: StatKey, layer: Layer, v: number) {
  const x = (b[stat] ??= { base: 0, pure: 0, direct: 0 });
  x[layer] += v;
}

/** Pick the best OR-option of each slot for this wearer (cheap weighted value). */
function bestOptions(team: Team, slot: number, equipId: number, db: Db, w: Partial<Record<StatKey, number>>): EquipChoice {
  const eq = db.equips.get(equipId)!;
  const options = eq.slots.map((s, si) => {
    if (s.options.length <= 1) return 0;
    let best = 0, bestV = -1;
    s.options.forEach((_, oi) => {
      const trial: EquipChoice = { equipId, options: eq.slots.map((_, j) => (j === si ? oi : 0)) };
      const v = evalEquip(team, slot, trial, db).filter((e) => e.slot === si).reduce((acc, e) => acc + (e.line.stats ?? []).reduce((a, st) => a + (w[st] ?? 0) * e.value, 0), 0);
      if (v > bestV) { bestV = v; best = oi; }
    });
    return best;
  });
  return { equipId, options };
}

export interface EquipPick { choice: EquipChoice; gain: number }

/**
 * Greedy 3-piece selection maximizing the member's weighted final stats.
 * Because layers multiply, the greedy naturally spreads bonuses across base / pure / direct.
 * `allowed` restricts to a user's owned equipment ids.
 */
export function optimizeEquipment(team: Team, slot: number, db: Db, p: Priority, allowed?: Set<number>): EquipPick[] {
  const m = team.slots[slot];
  if (!m) return [];
  const w = statWeights(p, attackType(db.char(m.charId)));
  const bare: Team = { ...team, slots: team.slots.map((x, i) => (i === slot && x ? { ...x, equipment: [null, null, null] } : x)) };
  const sheet = computeSheet(bare, db).members[slot]!;
  const buckets: Buckets = {};
  for (const [k, line] of Object.entries(sheet.stats) as [StatKey, (typeof sheet.stats)[StatKey]][]) {
    for (const src of ['z', 'zenkai', 'assault'] as const) {
      const b = line.bySource[src];
      addTo(buckets, k, 'base', b.base); addTo(buckets, k, 'pure', b.pure); addTo(buckets, k, 'direct', b.direct);
    }
  }
  const candidates = (db.equipFor.get(m.charId) ?? []).filter((id) => db.equips.get(id)?.battle && (!allowed || allowed.has(id)));
  // precompute each candidate's bonus list once (conditions depend on trio, not on other pieces)
  const pre = candidates.map((id) => {
    const choice = bestOptions(bare, slot, id, db, w);
    const probe: Team = { ...bare, slots: bare.slots.map((x, i) => (i === slot && x ? { ...x, equipment: [choice, null, null] } : x)) };
    return { choice, bonuses: equipBonuses(evalEquip(probe, slot, choice, db)) };
  }).filter((c) => c.bonuses.length);

  const picks: EquipPick[] = [];
  const used = new Set<number>();
  for (let k = 0; k < 3; k++) {
    const baseObj = objective(buckets, w);
    let best: (typeof pre)[number] | null = null, bestGain = 0;
    void baseObj;
    for (const c of pre) {
      if (used.has(c.choice.equipId)) continue;
      const gain = incrementalGain(buckets, c.bonuses, w);
      if (gain > bestGain) { bestGain = gain; best = c; }
    }
    if (!best) break;
    used.add(best.choice.equipId);
    for (const b of best.bonuses) addTo(buckets, b.stat, b.layer, b.value);
    picks.push({ choice: best.choice, gain: bestGain });
  }
  return picks;
}

/** Return a copy of the team with optimized equipment on every battle member. */
export function withOptimizedEquipment(team: Team, db: Db, p: Priority, allowed?: Set<number>): Team {
  let t: Team = team;
  for (const slot of [0, 1, 2]) {
    if (!t.slots[slot]) continue;
    const picks = optimizeEquipment(t, slot, db, p, allowed);
    const eq = [0, 1, 2].map((i) => picks[i]?.choice ?? null);
    t = { ...t, slots: t.slots.map((x, i) => (i === slot && x ? { ...x, equipment: eq } : x)) };
  }
  return t;
}

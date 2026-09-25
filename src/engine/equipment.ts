import type { EquipCond, EquipLine, Equipment, Layer, StatKey } from '../data/types';
import type { Db } from './db';
import { matches, trioOf, type EquipChoice, type Team } from './zAbilities';

export function canEquip(eq: Equipment, charId: number): boolean {
  return eq.anyone || eq.eligible.includes(charId);
}

export interface LineEval {
  line: EquipLine;
  slot: number;
  /** effective value after per-member scaling (0 if inactive) */
  value: number;
  active: boolean;
  calculable: boolean;
  /** human readable status: "3/3", "×2", "wearer ✓" */
  required?: number;
  current?: number;
  missing?: number;
  multiplier?: number;
  rule?: string;
}

function countInTrio(team: Team, wearer: number, cond: EquipCond & { group: unknown }, db: Db, excludeSelf: boolean): number {
  let n = 0;
  for (const i of trioOf(wearer)) {
    const m = team.slots[i];
    if (!m) continue;
    if (excludeSelf && i === wearer) continue;
    if (matches((cond as { group: number[][] | null }).group, db.tagSet(m.charId))) n++;
  }
  return n;
}

function sameEquipCount(team: Team, equipId: number): number {
  let n = 0;
  for (const m of team.slots) if (m?.equipment.some((e) => e?.equipId === equipId)) n++;
  return n;
}

/** Evaluate one equipped piece for the member in `wearer` slot. */
export function evalEquip(team: Team, wearer: number, choice: EquipChoice, db: Db): LineEval[] {
  const eq = db.equips.get(choice.equipId);
  const m = team.slots[wearer];
  if (!eq || !m) return [];
  const out: LineEval[] = [];
  eq.slots.forEach((slot, si) => {
    const opt = slot.options[choice.options[si] ?? 0] ?? slot.options[0];
    if (!opt) return;
    for (const line of opt.lines) {
      if (line.contextual || !line.stats) { out.push({ line, slot: si, value: 0, active: false, calculable: false }); continue; }
      const roll = choice.values?.[si] ?? line.max ?? 0;
      const c = line.cond;
      if (!c) { out.push({ line, slot: si, value: roll, active: true, calculable: true }); continue; }
      if (c.type === 'wearer') {
        const ok = matches(c.group, db.tagSet(m.charId));
        out.push({ line, slot: si, value: ok ? roll : 0, active: ok, calculable: true, required: 1, current: ok ? 1 : 0, missing: ok ? 0 : 1, rule: 'the wearer must have it' });
      } else if (c.type === 'count') {
        const n = countInTrio(team, wearer, c, db, c.excludeSelf);
        const ok = n >= c.min;
        out.push({ line, slot: si, value: ok ? roll : 0, active: ok, calculable: true, required: c.min, current: n, missing: Math.max(0, c.min - n), rule: c.excludeSelf ? `${c.min} other in their trio` : `${c.min} in their trio, wearer included` });
      } else if (c.type === 'per') {
        const n = countInTrio(team, wearer, c, db, c.excludeSelf);
        out.push({ line, slot: si, value: roll * n, active: n > 0, calculable: true, multiplier: n, current: n, rule: 'per trio member with the tag' });
      } else if (c.type === 'sameEquip') {
        const n = sameEquipCount(team, eq.id);
        out.push({ line, slot: si, value: roll * n, active: n > 0, calculable: true, multiplier: n, current: n, rule: 'per team member wearing this piece' });
      }
    }
  });
  return out;
}

export function conditionText(line: EquipLine, db: Db): string | null {
  const c = line.cond;
  if (!c) return null;
  const g = (group: number[][] | null) => (group ? group.map((x) => x.map((t) => db.tagName(t)).join(' + ')).join(' or ') : 'anyone');
  switch (c.type) {
    case 'wearer': return `Wearer is ${g(c.group)}`;
    case 'count': return `${c.min}${c.excludeSelf ? ' other' : ''} ${g(c.group)} in trio`;
    case 'per': return `Per ${g(c.group)} in trio`;
    case 'sameEquip': return 'Per team member wearing this piece';
  }
}

export interface LayerBonus { stat: StatKey; layer: Layer; value: number }
export function equipBonuses(evals: LineEval[]): LayerBonus[] {
  const out: LayerBonus[] = [];
  for (const e of evals) {
    if (!e.calculable || !e.active || !e.line.stats || !e.line.layer) continue;
    for (const s of e.line.stats) out.push({ stat: s, layer: e.line.layer, value: e.value });
  }
  return out;
}

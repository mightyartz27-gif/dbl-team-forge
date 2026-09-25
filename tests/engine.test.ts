import { describe, expect, it } from 'vitest';
import characters from '../src/data/generated/characters.json';
import equipment from '../src/data/generated/equipment.json';
import tags from '../src/data/generated/tags.json';
import meta from '../src/data/generated/meta.json';
import type { GameData } from '../src/data/types';
import { Db } from '../src/engine/db';
import { computeSheet } from '../src/engine/stats';
import { newMember, propagate, type Team } from '../src/engine/zAbilities';
import { evalEquip } from '../src/engine/equipment';
import { generateTeams } from '../src/engine/generator';
import { evaluateTeam } from '../src/engine/scoring';

const db = new Db({ characters, equipment, tags, meta } as unknown as GameData);
const byCard = (card: string) => db.data.characters.find((c) => c.card === card)!;
const team = (cards: string[], leader: number | null): Team => ({
  slots: cards.map((c) => (c ? newMember(byCard(c).id, byCard(c)) : null)).concat(Array(6 - cards.length).fill(null)),
  leader,
});

describe('Z ability mechanics', () => {
  const gogeta = byCard('DBL30-01S'); // Z IV: +35% Movies / God Ki / Fusion Warrior base Strike & Blast ATK
  it('applies a line only to recipients meeting its condition', () => {
    const t = team(['DBL30-01S', 'DBL01-02E'], null); // Gogeta + Goku (Dragon Ball Z era, not Movies/God Ki/Fusion)
    const apps = propagate(t, db).filter((a) => a.giver === 0 && a.source === 'z');
    expect(apps.find((a) => a.recipient === 0)!.applied).toBe(true);
    expect(apps.find((a) => a.recipient === 1)!.applied).toBe(db.tagSet(byCard('DBL01-02E').id).has(20015));
    expect(gogeta.z![3]!.lines[0].stats[0].value).toBe(35);
  });
  it('Leader receives every Z Ability unconditionally', () => {
    const t = team(['DBL30-01S', 'DBL01-02E'], 1);
    const app = propagate(t, db).find((a) => a.giver === 0 && a.recipient === 1 && a.source === 'z')!;
    expect(app.applied).toBe(true);
    expect(app.reason === 'leader-receives' || app.reason === 'condition').toBe(true);
  });
  it('Leader gives its Z Ability unconditionally to trio mates only', () => {
    const t = team(['DBL30-01S', 'DBL01-02E', '', 'DBL01-02E'], 0);
    const apps = propagate(t, db).filter((a) => a.giver === 0 && a.source === 'z');
    expect(apps.find((a) => a.recipient === 1)!.applied).toBe(true);
  });
  it('layers multiply, same layer adds', () => {
    const t = team(['DBL30-01S'], 0);
    const s = computeSheet(t, db).members[0]!;
    const b = s.stats.sa.total;
    expect(s.stats.sa.final).toBeCloseTo(((1 + b.base / 100) * (1 + b.pure / 100) * (1 + b.direct / 100) - 1) * 100, 6);
  });
});

describe('equipment conditions', () => {
  it('counts trio members for "when N battle members are X"', () => {
    const eq = db.data.equipment.find((e) => e.slots.some((s) => s.options.some((o) => o.lines.some((l) => l.cond?.type === 'count' && (l.cond as { min: number }).min === 3))))!;
    expect(eq).toBeTruthy();
    const holder = db.data.characters.find((c) => eq.anyone || eq.eligible.includes(c.id))!;
    const t = team([holder.card], 0);
    t.slots[0]!.equipment[0] = { equipId: eq.id, options: [0, 0, 0] };
    const evals = evalEquip(t, 0, t.slots[0]!.equipment[0]!, db).filter((e) => e.line.cond?.type === 'count');
    for (const e of evals) expect(e.current).toBeLessThanOrEqual(1);
  });
});

describe('generator', () => {
  it('keeps locked characters and fills a full team quickly', () => {
    const pool = db.data.characters.map((c) => c.id);
    const lockId = byCard('DBL30-01S').id;
    const t0 = performance.now();
    const res = generateTeams(db, { locked: [lockId], pool, priorities: ['balanced', 'zenkai', 'health'] });
    const ms = performance.now() - t0;
    console.log(`generated ${res.length} teams in ${ms.toFixed(0)} ms`);
    for (const r of res) {
      console.log(r.priority, r.evaluation.overall.toFixed(1), r.team.slots.map((m) => db.char(m!.charId).name).join(' | '), 'leader', r.team.leader,
        'zk', r.evaluation.metrics.zenkaiActive, 'cov', r.evaluation.metrics.coverage.map((c) => c.toFixed(2)).join('/'), 'hp', r.evaluation.metrics.health.toFixed(0), 'sa', r.evaluation.metrics.strike.toFixed(0), 'eq', `${r.evaluation.metrics.equipActive}/${r.evaluation.metrics.equipConditional}`);
      expect(r.team.slots.slice(0, 3).map((m) => m!.charId)).toContain(lockId);
      expect(r.team.slots.every(Boolean)).toBe(true);
      expect(new Set(r.team.slots.map((m) => m!.charId)).size).toBe(6);
    }
    expect(ms).toBeLessThan(8000);
  });
  it('evaluates a manual team', () => {
    const e = evaluateTeam(team(['DBL30-01S', 'DBL01-02E', 'DBL01-02E'], 0), db, 'balanced');
    expect(e.overall).toBeGreaterThanOrEqual(0);
  });
});

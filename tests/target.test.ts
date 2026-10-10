import { describe, expect, it } from 'vitest';
import characters from '../src/data/generated/characters.json';
import equipment from '../src/data/generated/equipment.json';
import tags from '../src/data/generated/tags.json';
import meta from '../src/data/generated/meta.json';
import pvp from '../src/data/generated/pvp.json';
import type { GameData } from '../src/data/types';
import { Db } from '../src/engine/db';
import { generateForTarget } from '../src/engine/generator';

const db = new Db({ characters, equipment, tags, meta, pvp } as unknown as GameData);
const pool = db.data.characters.map((c) => c.id);
const gogeta = db.data.characters.find((c) => c.card === 'DBL30-01S')!.id;

describe('Target Ability Bonus', () => {
  it('finds whole-team totals of 8000+ around a strong unit, ranked by the chosen priority', () => {
    const t0 = performance.now();
    const r = generateForTarget(db, { locked: [gogeta], pool, priorities: [], target: { value: 8000, basis: 'team' } }, 'balanced');
    console.log(`team 8000: reached=${r.reached} best=${r.best.toFixed(0)} teams=${r.teams.length} in ${(performance.now() - t0).toFixed(0)} ms`,
      r.teams.map((x) => `${x.evaluation.metrics.abilityBonusTeam.toFixed(0)}/score ${x.evaluation.overall.toFixed(0)}`).join(', '));
    expect(r.reached).toBe(true);
    for (const t of r.teams) {
      expect(t.evaluation.metrics.abilityBonusTeam).toBeGreaterThanOrEqual(8000);
      expect(t.team.slots.map((m) => m?.charId)).toContain(gogeta);
    }
    for (let i = 1; i < r.teams.length; i++) expect(r.teams[i - 1].evaluation.overall).toBeGreaterThanOrEqual(r.teams[i].evaluation.overall);
  });
  it('returns the closest teams and the best value when the target is impossible', () => {
    const r = generateForTarget(db, { locked: [gogeta], pool, priorities: [], target: { value: 50000, basis: 'fighters' } }, 'balanced');
    console.log(`fighters 50000: reached=${r.reached} best=${r.best.toFixed(0)}`);
    expect(r.reached).toBe(false);
    expect(r.teams.length).toBeGreaterThan(0);
    expect(r.teams[0].evaluation.metrics.abilityBonus).toBeCloseTo(r.best, 6);
  });
  it('works with no locked character', () => {
    const r = generateForTarget(db, { locked: [], pool, priorities: [], target: { value: 7000, basis: 'team' } }, 'abilitybonus');
    console.log(`no lock team 7000: reached=${r.reached} best=${r.best.toFixed(0)}`);
    expect(r.teams.length).toBeGreaterThan(0);
  });
});

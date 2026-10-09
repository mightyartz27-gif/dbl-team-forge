import { describe, expect, it } from 'vitest';
import characters from '../src/data/generated/characters.json';
import equipment from '../src/data/generated/equipment.json';
import tags from '../src/data/generated/tags.json';
import meta from '../src/data/generated/meta.json';
import pvp from '../src/data/generated/pvp.json';
import type { GameData } from '../src/data/types';
import { Db } from '../src/engine/db';
import { evaluateTeam, STACK_STATS } from '../src/engine/scoring';
import { generateTeams } from '../src/engine/generator';
import { DEFAULT_EVAL } from '../src/engine/weights';
import { abilitiesOf, newMember, type Team } from '../src/engine/zAbilities';

const db = new Db({ characters, equipment, tags, meta, pvp } as unknown as GameData);
const byCard = (card: string) => db.data.characters.find((c) => c.card === card)!;
const gogeta = byCard('DBL30-01S');

describe('analysis options', () => {
  it('box Zenkai state: an owned, non-awakened character loses its Zenkai Z Ability', () => {
    expect(gogeta.zenkai).toBe(true);
    const on = newMember(gogeta.id, gogeta);
    const off = newMember(gogeta.id, gogeta, { notAwakened: [gogeta.id] });
    expect(abilitiesOf(on, db).some((a) => a.source === 'zenkai')).toBe(true);
    expect(abilitiesOf(off, db).some((a) => a.source === 'zenkai')).toBe(false);
    const res = generateTeams(db, { locked: [gogeta.id], pool: db.data.characters.map((c) => c.id), priorities: ['balanced'], notAwakened: [gogeta.id] });
    expect(res[0].team.slots[0]!.zenkai || res[0].team.slots.find((m) => m?.charId === gogeta.id)!.zenkai).toBe(false);
  });
  it('stacked output totals equal the sum of the listed stats', () => {
    const res = generateTeams(db, { locked: [gogeta.id], pool: db.data.characters.map((c) => c.id), priorities: ['balanced'] });
    const e = res[0].evaluation;
    for (const s of e.metrics.stacked) expect(s.total).toBeCloseTo(STACK_STATS.reduce((a, k) => a + s.stats[k], 0), 6);
    expect(e.metrics.abilityBonus).toBeCloseTo(e.metrics.stacked.reduce((a, s) => a + s.total, 0), 6);
    console.log('Ability Bonus', e.metrics.abilityBonus.toFixed(0), 'grade', e.metrics.grade, 'styles', JSON.stringify(e.metrics.styles), 'cohesion', e.components.cohesion.toFixed(0));
  });
  it('balance blend: protecting the weakest fighter never raises a component above the plain average', () => {
    const res = generateTeams(db, { locked: [gogeta.id], pool: db.data.characters.map((c) => c.id), priorities: ['balanced'] });
    const t: Team = res[0].team;
    const carry = evaluateTeam(t, db, 'balanced', [], { ...DEFAULT_EVAL, floor: 0 });
    const safe = evaluateTeam(t, db, 'balanced', [], { ...DEFAULT_EVAL, floor: 1 });
    expect(safe.components.offense).toBeLessThanOrEqual(carry.components.offense + 1e-9);
    expect(safe.components.zEfficiency).toBeLessThanOrEqual(carry.components.zEfficiency + 1e-9);
  });
  it('coverage and cohesion change the evaluation as configured', () => {
    const res = generateTeams(db, { locked: [gogeta.id], pool: db.data.characters.map((c) => c.id), priorities: ['balanced'] });
    const t = res[0].team;
    const noCoh = evaluateTeam(t, db, 'balanced', [], { ...DEFAULT_EVAL, cohesion: false });
    const coh = evaluateTeam(t, db, 'balanced', [], { ...DEFAULT_EVAL, cohesion: true });
    expect(noCoh.overall).not.toBe(coh.overall);
    const s = evaluateTeam(t, db, 'balanced', [], { ...DEFAULT_EVAL, coverage: 'strike' });
    const b = evaluateTeam(t, db, 'balanced', [], { ...DEFAULT_EVAL, coverage: 'blast' });
    expect(s.components.defense).not.toBe(b.components.defense);
  });
  it('thorough depth runs in reasonable time', () => {
    const t0 = performance.now();
    generateTeams(db, { locked: [gogeta.id], pool: db.data.characters.map((c) => c.id), priorities: ['balanced'], evalOpts: { ...DEFAULT_EVAL, depth: 'thorough' } });
    const ms = performance.now() - t0;
    console.log('thorough ms', ms.toFixed(0));
    expect(ms).toBeLessThan(6000);
  });
});

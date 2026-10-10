import { describe, expect, it } from 'vitest';
import characters from '../src/data/generated/characters.json';
import equipment from '../src/data/generated/equipment.json';
import tags from '../src/data/generated/tags.json';
import meta from '../src/data/generated/meta.json';
import pvp from '../src/data/generated/pvp.json';
import type { GameData } from '../src/data/types';
import { Db } from '../src/engine/db';
import { generateForTarget, generateTeams, type GeneratedTeam } from '../src/engine/generator';
import { DEFAULT_EVAL, PRIORITIES } from '../src/engine/weights';

const db = new Db({ characters, equipment, tags, meta, pvp } as unknown as GameData);
const all = db.data.characters.map((c) => c.id);
const lock = db.data.characters.find((c) => c.card === 'DBL30-01S')!.id;
const box = all.filter((_, i) => i % 2 === 0).concat(lock);
const zb = (r: GeneratedTeam) => r.team.slots.slice(3).filter((m) => m && db.char(m.charId).zenkai && m.zenkai).length;

describe('Zenkai support on the bench', () => {
  for (const [label, pool] of [['all characters', all], ['a half box', box]] as const) {
    it(`every option and the target search keep Zenkai Awakened support on the bench (${label})`, () => {
      const res = generateTeams(db, { locked: [lock], pool: [...pool], priorities: PRIORITIES.map((p) => p.id) });
      const t = generateForTarget(db, { locked: [lock], pool: [...pool], priorities: [], target: { value: 7000, basis: 'team' } }, 'balanced');
      const off = generateTeams(db, { locked: [lock], pool: [...pool], priorities: PRIORITIES.map((p) => p.id), evalOpts: { ...DEFAULT_EVAL, zenkaiBench: false } });
      console.log(label.padEnd(15), 'prefer ON :', res.map((r) => `${r.priority}:${zb(r)}`).join(' '), '| target', t.teams.map(zb).join(','));
      console.log(''.padEnd(15), 'prefer OFF:', off.map((r) => `${r.priority}:${zb(r)}`).join(' '));
      console.log(''.padEnd(15), 'Ability Bonus team (ON vs OFF):', res.find((r) => r.priority === 'abilitybonus')!.evaluation.metrics.abilityBonusTeam.toFixed(0), 'vs', off.find((r) => r.priority === 'abilitybonus')!.evaluation.metrics.abilityBonusTeam.toFixed(0));
      for (const r of [...res, ...t.teams]) expect(zb(r)).toBeGreaterThanOrEqual(2);
    });
  }
});

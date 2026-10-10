import { describe, expect, it } from 'vitest';
import characters from '../src/data/generated/characters.json';
import equipment from '../src/data/generated/equipment.json';
import tags from '../src/data/generated/tags.json';
import meta from '../src/data/generated/meta.json';
import pvp from '../src/data/generated/pvp.json';
import type { GameData } from '../src/data/types';
import { Db } from '../src/engine/db';
import { generateTeams } from '../src/engine/generator';
import type { Priority } from '../src/engine/weights';

const db = new Db({ characters, equipment, tags, meta, pvp } as unknown as GameData);
const pool = db.data.characters.map((c) => c.id);
const CARDS = ['DBL30-01S', 'DBL85-03U', 'DBL01-02E', 'DBL97-02L'];

describe('Ability Bonus and Deck cohesion priorities', () => {
  for (const card of CARDS) {
    const c = db.data.characters.find((x) => x.card === card);
    if (!c) continue;
    it(`beat Balanced on their own metric around ${c.name} (${card})`, () => {
      const run = (p: Priority) => generateTeams(db, { locked: [c.id], pool, priorities: [p] })[0];
      const bal = run('balanced'), ab = run('abilitybonus'), coh = run('cohesion');
      const avgCoh = (r: typeof bal) => r.evaluation.metrics.stacked.reduce((s, x) => s + x.cohesion, 0) / r.evaluation.metrics.stacked.length;
      console.log(card.padEnd(10), 'AbilityBonus  balanced', bal.evaluation.metrics.abilityBonus.toFixed(0).padStart(5), '→ abilitybonus', ab.evaluation.metrics.abilityBonus.toFixed(0).padStart(5),
        ' | cohesion balanced', (avgCoh(bal) * 100).toFixed(0), '→ cohesion', (avgCoh(coh) * 100).toFixed(0));
      expect(ab.evaluation.metrics.abilityBonus).toBeGreaterThanOrEqual(bal.evaluation.metrics.abilityBonus * 0.98);
      expect(avgCoh(coh)).toBeGreaterThanOrEqual(avgCoh(bal) - 0.02);
      expect(ab.team.slots.map((m) => m?.charId)).toContain(c.id);
    });
  }
});

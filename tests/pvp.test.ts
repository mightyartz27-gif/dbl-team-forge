import { describe, expect, it } from 'vitest';
import characters from '../src/data/generated/characters.json';
import equipment from '../src/data/generated/equipment.json';
import tags from '../src/data/generated/tags.json';
import meta from '../src/data/generated/meta.json';
import pvp from '../src/data/generated/pvp.json';
import type { GameData } from '../src/data/types';
import { Db } from '../src/engine/db';
import { computeSheet } from '../src/engine/stats';
import { generateTeams } from '../src/engine/generator';
import { DEFAULT_TIER_FILTER, tierKey } from '../src/engine/pvp';
import { newMember, type Team } from '../src/engine/zAbilities';

const db = new Db({ characters, equipment, tags, meta, pvp } as unknown as GameData);
const byCard = (card: string) => db.data.characters.find((c) => c.card === card)!;

describe('Rating Match tiers', () => {
  it('maps every listed card to a character', () => {
    const cards = new Set(db.data.characters.map((c) => c.card.toUpperCase()));
    for (const code of Object.keys(pvp.tiers)) expect(cards.has(code)).toBe(true);
  });
  it('adds the tier bonus to fighters only, and only in rating mode', () => {
    const tierZ = db.data.characters.find((c) => db.tierOf(c.id) === 'Z' && !c.zenkai)!;
    const m = () => newMember(tierZ.id, tierZ);
    const rating: Team = { slots: [m(), null, null, m(), null, null], leader: 0, ruleset: 'rating' };
    const s = computeSheet(rating, db);
    expect(s.members[0]!.stats.dmg.bySource.tier.direct).toBe(pvp.bonus.Z.pre.dmg);
    expect(s.members[0]!.stats.dmgGuard.bySource.tier.direct).toBe(pvp.bonus.Z.pre.guard);
    expect(s.members[3]!.stats.dmg.bySource.tier.direct).toBe(0); // bench: no bonus
    const std = computeSheet({ ...rating, ruleset: 'standard' }, db);
    expect(std.members[0]!.stats.dmg.bySource.tier.direct).toBe(0);
  });
  it('uses the smaller post-Zenkai bonus when awakened', () => {
    const c = db.data.characters.find((x) => db.tierOf(x.id) === 'S' && x.zenkai)!;
    const t = (zenkai: boolean): Team => ({ slots: [{ ...newMember(c.id, c), zenkai }, null, null, null, null, null], leader: 0, ruleset: 'rating' });
    expect(computeSheet(t(true), db).members[0]!.tier!.dmg).toBe(pvp.bonus.S.post.dmg);
    expect(computeSheet(t(false), db).members[0]!.tier!.dmg).toBe(pvp.bonus.S.pre.dmg);
  });
  it('generates PvP teams whose fighters respect the tier filter, with or without locks', () => {
    const pool = db.data.characters.map((c) => c.id);
    const allowed = new Set(DEFAULT_TIER_FILTER);
    const fighterPool = pool.filter((id) => allowed.has(tierKey(db, id) as never));
    const t0 = performance.now();
    const free = generateTeams(db, { locked: [], pool, fighterPool, priorities: ['balanced', 'damage'], ruleset: 'rating', llBand: 1 });
    const lock = byCard('DBL85-03U').id; // Tier A ULTRA
    const locked = generateTeams(db, { locked: [lock], pool, fighterPool, priorities: ['balanced'], ruleset: 'rating', llBand: 1 });
    console.log('pvp gen ms', (performance.now() - t0).toFixed(0));
    for (const r of [...free, ...locked]) {
      console.log(r.priority, r.evaluation.overall.toFixed(1), r.team.slots.slice(0, 3).map((m) => `${db.char(m!.charId).name} [${tierKey(db, m!.charId)}]`).join(' | '), 'dmg+', r.evaluation.metrics.tierDmg.toFixed(0));
      r.team.slots.slice(0, 3).forEach((m) => { if (m!.charId !== lock) expect(allowed.has(tierKey(db, m!.charId) as never)).toBe(true); });
      expect(r.team.ruleset).toBe('rating');
    }
    expect(free.length).toBeGreaterThan(0);
  });
});

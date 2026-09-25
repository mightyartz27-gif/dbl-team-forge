import type { Character, Equipment, GameData, Tag, TierId } from '../data/types';

/** Indexed, read-only view of the game data used by every engine function. */
export class Db {
  readonly chars: Map<number, Character>;
  readonly equips: Map<number, Equipment>;
  readonly tags: Map<number, Tag>;
  readonly tagSets: Map<number, Set<number>>;
  /** equipment ids each character can wear */
  readonly equipFor: Map<number, number[]>;
  constructor(readonly data: GameData) {
    this.chars = new Map(data.characters.map((c) => [c.id, c]));
    this.equips = new Map(data.equipment.map((e) => [e.id, e]));
    this.tags = new Map(data.tags.map((t) => [t.id, t]));
    this.tagSets = new Map(data.characters.map((c) => [c.id, new Set(c.tags)]));
    this.equipFor = new Map();
    const anyone = data.equipment.filter((e) => e.anyone).map((e) => e.id);
    for (const c of data.characters) this.equipFor.set(c.id, [...anyone]);
    for (const e of data.equipment) for (const id of e.eligible) this.equipFor.get(id)?.push(e.id);
  }
  char(id: number): Character {
    const c = this.chars.get(id);
    if (!c) throw new Error(`Unknown character ${id}`);
    return c;
  }
  /** Rating Match tier of a character, or null when the official list doesn't include it. */
  tierOf(id: number): TierId | null {
    const c = this.chars.get(id);
    return (c && this.data.pvp?.tiers[c.card.toUpperCase()]) || null;
  }
  tagName(id: number): string { return this.tags.get(id)?.name ?? `#${id}`; }
  tagSet(id: number): Set<number> { return this.tagSets.get(id) ?? new Set(); }
}

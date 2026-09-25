// Normalized game data. Produced by scripts/ingest/normalize.mjs; consumed by src/engine.
export type StatKey =
  | 'hp' | 'sa' | 'ba' | 'sd' | 'bd'
  | 'crit' | 'critDmg' | 'ki' | 'heal'
  | 'dmg' | 'dmgStrike' | 'dmgBlast' | 'dmgSpecial' | 'dmgUltimate' | 'dmgStrikeArts' | 'dmgBlastArts'
  | 'dmgGuard' | 'dmgCut';
export type Layer = 'base' | 'pure' | 'direct';

/** OR of AND-groups of tag ids: [[a],[b,c]] means a OR (b AND c). null = everyone. */
export type Cond = number[][] | null;

export interface StatValue { stat: StatKey; layer: Layer; value: number }
export interface ZLine { cond: Cond; stats: StatValue[] }
export interface ZLevel { name: string; text: string; lines: ZLine[]; parsed: boolean; contextual?: string[] }

export type Rarity = 'ULTRA' | 'SPARKING' | 'EXTREME' | 'HERO' | 'LEGEND';
export type Color = 'RED' | 'YEL' | 'PUR' | 'GRN' | 'BLU' | 'LGT';

export interface Character {
  id: number;
  card: string;
  name: string;
  forms: string[];
  rarity: Rarity;
  lf: boolean;
  color: Color;
  colors: Color[];
  tags: number[];
  zenkai: boolean;
  icon: string | null;
  base: { hp: number; sa: number; ba: number; sd: number; bd: number } | null;
  z: (ZLevel | null)[] | null;
  zenkaiZ: (ZLevel | null)[] | null;
  assault: (ZLevel | null)[] | null;
  traits: { name: string; text: string }[];
  resonance: { name: string; text: string } | null;
  warnings: string[];
}

export type EquipCond =
  | { type: 'wearer'; group: Cond }
  | { type: 'count'; min: number; group: Cond; excludeSelf: boolean }
  | { type: 'per'; group: Cond; excludeSelf: boolean }
  | { type: 'sameEquip' };

export interface EquipLine {
  stats?: StatKey[];
  layer?: Layer;
  min?: number;
  max?: number;
  cond?: EquipCond | null;
  contextual?: boolean;
  raw: string;
}
export interface EquipOption { lines: EquipLine[] }
export interface EquipSlotDef { options: EquipOption[] }

export interface Equipment {
  id: number;
  name: string;
  rarity: string;
  icon: string;
  equipConditions: string[][];
  anyone: boolean;
  eligible: number[];
  exclusive: number | null;
  slots: EquipSlotDef[];
  battle: boolean;
  warnings: string[];
}

export interface Tag { id: number; name: string; kind: 'class' | 'rarity' | 'style' | 'color' | 'episode' | 'character' | 'card' | 'other' }

export interface DbMeta {
  source: string;
  fetchedAt: string;
  builtAt: string;
  counts: { characters: number; equipment: number; battleEquipment: number; tags: number };
  parse: Record<string, number>;
}

/** Official Rating Match tiers (Featured, Z, S, A, B, C). Bonuses are a balancing boost: less-used characters get more. */
export type TierId = 'featured' | 'Z' | 'S' | 'A' | 'B' | 'C';
export interface TierBonus { dmg: number; guard: number; llBonus: boolean }
export interface PvpData {
  source: string; url: string; title: string; seasonStart: string; seasons: number; fetchedAt: string; newsId: number;
  bonus: Record<TierId, { pre: TierBonus; post: TierBonus }>;
  llBands: { stars: string; value: number }[];
  /** card code (upper case) → tier */
  tiers: Record<string, TierId>;
}

export interface GameData { characters: Character[]; equipment: Equipment[]; tags: Tag[]; meta: DbMeta; pvp?: PvpData | null }

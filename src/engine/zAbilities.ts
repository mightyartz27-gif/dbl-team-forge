import type { Character, Cond, StatValue, ZLevel, ZLine } from '../data/types';
import type { Db } from './db';

// ------------------------------------------------------------------ team model
export interface EquipChoice {
  equipId: number;
  /** chosen OR option per equipment slot (index into slot.options) */
  options: number[];
  /** roll value per slot (defaults to the line's max) */
  values?: (number | null)[];
}
export interface Member {
  charId: number;
  /** Z Ability level 1..4 (levels don't stack: the level reached counts) */
  zLevel: 1 | 2 | 3 | 4;
  /** Zenkai Awakened? Only meaningful if the character has a Zenkai Z Ability */
  zenkai: boolean;
  equipment: (EquipChoice | null)[];
}
/** Slots 0..2 = battle members, 3..5 = bench. Leader is a battle slot index (or null). */
export interface Team {
  slots: (Member | null)[];
  leader: number | null;
}

export const BATTLE = [0, 1, 2] as const;
export const BENCH = [3, 4, 5] as const;
export const isBattle = (i: number) => i < 3;
export const trioOf = (i: number) => (i < 3 ? [0, 1, 2] : [3, 4, 5]);

export function newMember(charId: number, c?: Character): Member {
  return { charId, zLevel: 4, zenkai: !!c?.zenkai, equipment: [null, null, null] };
}
export function emptyTeam(): Team {
  return { slots: [null, null, null, null, null, null], leader: null };
}

// ------------------------------------------------------------------ conditions
export function matches(cond: Cond, tags: Set<number>): boolean {
  if (!cond) return true;
  return cond.some((group) => group.every((t) => tags.has(t)));
}

export function condLabel(cond: Cond, db: Db): string {
  if (!cond) return 'everyone';
  return cond.map((g) => g.map((t) => db.tagName(t)).join(' + ')).join(' or ');
}

// ------------------------------------------------------------------ abilities of one member
export type ZSource = 'z' | 'zenkai' | 'assault';
export interface GivenAbility {
  source: ZSource;
  level: ZLevel;
}

function pickLevel(levels: (ZLevel | null)[] | null, wanted: number): ZLevel | null {
  if (!levels) return null;
  for (let i = Math.min(wanted, levels.length) - 1; i >= 0; i--) if (levels[i]) return levels[i];
  return null;
}

export function abilitiesOf(m: Member, db: Db): GivenAbility[] {
  const c = db.char(m.charId);
  const out: GivenAbility[] = [];
  const z = pickLevel(c.z, m.zLevel);
  if (z) out.push({ source: 'z', level: z });
  if (c.zenkai && m.zenkai) {
    const zk = pickLevel(c.zenkaiZ, 4); // counted at maximum, like the game's Zenkai display
    if (zk) out.push({ source: 'zenkai', level: zk });
  }
  const as = pickLevel(c.assault, m.zLevel);
  if (as) out.push({ source: 'assault', level: as });
  return out;
}

// ------------------------------------------------------------------ propagation
export type ApplyReason = 'condition' | 'leader-receives' | 'leader-gives' | 'assault' | 'blocked' | 'assault-bench';
export interface Application {
  giver: number;         // slot index
  recipient: number;     // slot index
  source: ZSource;
  line: ZLine;
  applied: boolean;
  reason: ApplyReason;
}

/**
 * Apply every Z / Zenkai / Assault line of every member to every member.
 * Rules (per DBL Optimizer's documented mechanics):
 *  - A line applies when the recipient meets its condition.
 *  - The Leader, as a receiver, gets every Z Ability line unconditionally.
 *  - The Leader's own Z Ability applies unconditionally to its two trio teammates.
 *  - Assault Z Abilities only work while the carrier is a battle member and target allies.
 */
export function propagate(team: Team, db: Db): Application[] {
  const out: Application[] = [];
  const leader = team.leader;
  team.slots.forEach((giverM, g) => {
    if (!giverM) return;
    for (const ab of abilitiesOf(giverM, db)) {
      team.slots.forEach((recM, r) => {
        if (!recM) return;
        const tags = db.tagSet(recM.charId);
        for (const line of ab.level.lines) {
          let applied = false;
          let reason: ApplyReason = 'blocked';
          if (ab.source === 'assault') {
            if (r === g) continue; // "allies"
            if (!isBattle(g)) { reason = 'assault-bench'; }
            else { applied = true; reason = 'assault'; }
          } else if (leader !== null && r === leader) {
            applied = true; reason = 'leader-receives';
          } else if (leader !== null && g === leader && r !== g && trioOf(g).includes(r) && ab.source === 'z') {
            applied = true; reason = 'leader-gives';
          } else if (matches(line.cond, tags)) {
            applied = true; reason = 'condition';
          }
          out.push({ giver: g, recipient: r, source: ab.source, line, applied, reason });
        }
      });
    }
  });
  return out;
}

export function lineMagnitude(stats: StatValue[]): number {
  return stats.reduce((s, v) => s + v.value, 0);
}

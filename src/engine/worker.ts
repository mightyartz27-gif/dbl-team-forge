/// <reference lib="webworker" />
import type { GameData } from '../data/types';
import { Db } from './db';
import { generateTeams, type GeneratedTeam } from './generator';
import type { Priority } from './weights';

let db: Db | null = null;
export type WorkerIn =
  | { type: 'init'; data: GameData }
  | { type: 'generate'; id: number; locked: number[]; lockedBench: number[]; pool: number[]; priorities: Priority[]; fighterPool?: number[]; ruleset?: 'standard' | 'rating'; llBand?: number };
export type WorkerOut =
  | { type: 'ready' }
  | { type: 'progress'; id: number; result: GeneratedTeam; done: number; total: number }
  | { type: 'done'; id: number }
  | { type: 'error'; id: number; message: string };

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type === 'init') { db = new Db(msg.data); (self as unknown as Worker).postMessage({ type: 'ready' }); return; }
  if (msg.type === 'generate' && db) {
    try {
      // one priority at a time so results stream in; generateTeams de-duplicates within a call,
      // so pass the full list and stream from its onProgress hook.
      const seen: GeneratedTeam[] = [];
      const res = generateTeams(db, {
        locked: msg.locked, lockedBench: msg.lockedBench, pool: msg.pool, priorities: msg.priorities, fighterPool: msg.fighterPool, ruleset: msg.ruleset, llBand: msg.llBand,
        onResult: (r) => { seen.push(r); (self as unknown as Worker).postMessage({ type: 'progress', id: msg.id, result: r, done: seen.length, total: msg.priorities.length }); },
      });
      void res;
      (self as unknown as Worker).postMessage({ type: 'done', id: msg.id });
    } catch (e) {
      (self as unknown as Worker).postMessage({ type: 'error', id: msg.id, message: (e as Error).message });
    }
  }
};

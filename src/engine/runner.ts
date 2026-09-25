import type { GameData } from '../data/types';
import type { Db } from './db';
import { generateTeams, type GeneratedTeam } from './generator';
import type { Priority } from './weights';
import type { WorkerIn, WorkerOut } from './worker';
import GenWorker from './worker?worker&inline';

/** Runs team generation in a Web Worker; falls back to the main thread if workers are unavailable. */
export class Runner {
  private worker: Worker | null = null;
  private ready: Promise<boolean>;
  private seq = 0;
  constructor(private db: Db, data: GameData) {
    this.ready = new Promise((resolve) => {
      try {
        const w = new GenWorker();
        const timer = setTimeout(() => resolve(false), 4000);
        w.onmessage = (e: MessageEvent<WorkerOut>) => { if (e.data.type === 'ready') { clearTimeout(timer); this.worker = w; resolve(true); } };
        w.onerror = () => { clearTimeout(timer); resolve(false); };
        w.postMessage({ type: 'init', data } satisfies WorkerIn);
      } catch { resolve(false); }
    });
  }
  async generate(locked: number[], pool: number[], priorities: Priority[], onResult: (r: GeneratedTeam) => void, extra: { lockedBench?: number[]; fighterPool?: number[]; ruleset?: 'standard' | 'rating'; llBand?: number } = {}): Promise<void> {
    const lockedBench = extra.lockedBench ?? [];
    const useWorker = await this.ready;
    if (!useWorker || !this.worker) {
      // main-thread fallback: yield between priorities so the UI can paint progress
      const done = new Set<string>();
      for (const p of priorities) {
        await new Promise((r) => setTimeout(r, 16));
        const res = generateTeams(this.db, { locked, lockedBench, pool, priorities: [p], fighterPool: extra.fighterPool, ruleset: extra.ruleset, llBand: extra.llBand });
        for (const r of res) {
          const k = r.team.slots.map((m) => m?.charId).join(',');
          if (!done.has(k)) { done.add(k); onResult(r); }
        }
      }
      return;
    }
    const id = ++this.seq;
    const w = this.worker;
    await new Promise<void>((resolve, reject) => {
      const handler = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (!('id' in m) || m.id !== id) return;
        if (m.type === 'progress') onResult(m.result);
        if (m.type === 'done') { w.removeEventListener('message', handler); resolve(); }
        if (m.type === 'error') { w.removeEventListener('message', handler); reject(new Error(m.message)); }
      };
      w.addEventListener('message', handler);
      w.postMessage({ type: 'generate', id, locked, lockedBench, pool, priorities, fighterPool: extra.fighterPool, ruleset: extra.ruleset, llBand: extra.llBand } satisfies WorkerIn);
    });
  }
}

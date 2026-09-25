import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameData } from '../data/types';
import { Db } from '../engine/db';
import type { GeneratedTeam } from '../engine/generator';
import { Runner } from '../engine/runner';
import { PRIORITIES, type Priority } from '../engine/weights';
import { emptyTeam, type Team } from '../engine/zAbilities';

export type Page = 'home' | 'build' | 'team' | 'compare' | 'characters' | 'equipment';

export interface CurrentTeam {
  team: Team;
  priority: Priority;
  locked: number[];
  /** snapshot to diff against in the what-if view */
  baseline: Team | null;
  label: string;
}

interface Store {
  db: Db;
  origin: 'bundled' | 'supabase';
  runner: Runner;
  page: Page;
  go: (p: Page) => void;
  // box
  box: Set<number>;
  toggleBox: (id: number) => void;
  setBox: (ids: number[]) => void;
  boxOnly: boolean;
  setBoxOnly: (b: boolean) => void;
  pool: number[];
  // generator
  locked: number[];
  setLocked: (ids: number[]) => void;
  priority: Priority;
  setPriority: (p: Priority) => void;
  results: GeneratedTeam[];
  setResults: (r: GeneratedTeam[] | ((prev: GeneratedTeam[]) => GeneratedTeam[])) => void;
  generating: boolean;
  setGenerating: (b: boolean) => void;
  // current team
  current: CurrentTeam;
  setCurrent: (c: CurrentTeam | ((prev: CurrentTeam) => CurrentTeam)) => void;
  openTeam: (r: GeneratedTeam) => void;
  // sheets
  charSheet: number | null;
  openChar: (id: number | null) => void;
  equipSheet: number | null;
  openEquip: (id: number | null) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store not ready');
  return s;
};

const read = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

const PAGES: Page[] = ['home', 'build', 'team', 'compare', 'characters', 'equipment'];

export function StoreProvider({ data, origin, children }: { data: GameData; origin: 'bundled' | 'supabase'; children: ReactNode }) {
  const db = useMemo(() => new Db(data), [data]);
  const runnerRef = useRef<Runner | null>(null);
  if (!runnerRef.current) runnerRef.current = new Runner(db, data);

  const initialPage = (): Page => {
    const h = window.location.hash.replace('#/', '') as Page;
    return PAGES.includes(h) ? h : 'home';
  };
  const [page, setPage] = useState<Page>(initialPage);
  const go = useCallback((p: Page) => {
    setPage(p);
    try { window.history.pushState({ p }, '', `#/${p}`); } catch { /* sandboxed */ }
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const onPop = () => setPage(initialPage());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const [box, setBoxState] = useState<Set<number>>(() => new Set(read<number[]>('dbl.box', [])));
  const toggleBox = useCallback((id: number) => setBoxState((b) => { const n = new Set(b); n.has(id) ? n.delete(id) : n.add(id); write('dbl.box', [...n]); return n; }), []);
  const setBox = useCallback((ids: number[]) => { const n = new Set(ids); write('dbl.box', ids); setBoxState(n); }, []);
  const [boxOnly, setBoxOnlyState] = useState<boolean>(() => read('dbl.boxOnly', false));
  const setBoxOnly = (b: boolean) => { write('dbl.boxOnly', b); setBoxOnlyState(b); };
  const pool = useMemo(() => (boxOnly && box.size ? [...box] : data.characters.map((c) => c.id)), [boxOnly, box, data]);

  const [locked, setLockedState] = useState<number[]>(() => read<number[]>('dbl.locked', []).filter((id) => db.chars.has(id)));
  const setLocked = (ids: number[]) => { write('dbl.locked', ids); setLockedState(ids); };
  const [priority, setPriorityState] = useState<Priority>(() => read('dbl.priority', 'balanced'));
  const setPriority = (p: Priority) => { write('dbl.priority', p); setPriorityState(p); };
  const [results, setResults] = useState<GeneratedTeam[]>([]);
  const [generating, setGenerating] = useState(false);

  const [current, setCurrentState] = useState<CurrentTeam>(() => {
    const saved = read<CurrentTeam | null>('dbl.current', null);
    const valid = saved && saved.team.slots.every((m) => !m || db.chars.has(m.charId));
    return valid ? saved! : { team: emptyTeam(), priority: 'balanced', locked: [], baseline: null, label: 'My team' };
  });
  const setCurrent = useCallback((c: CurrentTeam | ((prev: CurrentTeam) => CurrentTeam)) => {
    setCurrentState((prev) => { const n = typeof c === 'function' ? c(prev) : c; write('dbl.current', n); return n; });
  }, []);
  const openTeam = useCallback((r: GeneratedTeam) => {
    setCurrent({ team: r.team, priority: r.priority, locked, baseline: r.team, label: `${PRIORITIES.find((p) => p.id === r.priority)?.label ?? 'Generated'} team` });
    go('team');
  }, [locked, go, setCurrent]);

  const [charSheet, openChar] = useState<number | null>(null);
  const [equipSheet, openEquip] = useState<number | null>(null);

  const value: Store = {
    db, origin, runner: runnerRef.current, page, go, box, toggleBox, setBox, boxOnly, setBoxOnly, pool,
    locked, setLocked, priority, setPriority, results, setResults, generating, setGenerating,
    current, setCurrent, openTeam, charSheet, openChar, equipSheet, openEquip,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

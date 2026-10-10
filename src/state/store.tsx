import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameData } from '../data/types';
import { Db } from '../engine/db';
import type { GeneratedTeam } from '../engine/generator';
import { Runner } from '../engine/runner';
import { DEFAULT_EVAL, PRIORITIES, type EvalOptions, type Priority } from '../engine/weights';
import { emptyTeam, type Team } from '../engine/zAbilities';
import { DEFAULT_TIER_FILTER, tierKey, type TierFilterKey } from '../engine/pvp';

export type Page = 'home' | 'build' | 'team' | 'compare' | 'characters' | 'equipment';

export interface CurrentTeam {
  team: Team;
  priority: Priority;
  locked: number[];
  /** snapshot to diff against in the what-if view */
  baseline: Team | null;
  label: string;
}

export interface HistoryEntry { at: string; label: string; priority: Priority; team: Team; locked: number[] }

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
  /** box characters that count as Zenkai Awakened (the default for owned Zenkai units) */
  boxZenkai: Set<number>;
  toggleBoxZenkai: (id: number) => void;
  setBoxZenkai: (ids: number[]) => void;
  /** count every owned Zenkai unit as awakened again */
  resetZenkai: () => void;
  /** owned Zenkai-capable characters that are NOT awakened: counted without Zenkai */
  notAwakened: number[];
  // analysis options (shared by Build and Team)
  evalOpts: EvalOptions;
  setEvalOpts: (o: Partial<EvalOptions>) => void;
  // history
  history: HistoryEntry[];
  pushHistory: (e: Omit<HistoryEntry, 'at'>) => void;
  clearHistory: () => void;
  // Target Ability Bonus
  target: { on: boolean; value: number; basis: 'team' | 'fighters' };
  setTarget: (t: Partial<{ on: boolean; value: number; basis: 'team' | 'fighters' }>) => void;
  pool: number[];
  // Rating Match (PvP)
  ruleset: 'standard' | 'rating';
  setRuleset: (r: 'standard' | 'rating') => void;
  tierFilter: Set<TierFilterKey>;
  toggleTier: (t: TierFilterKey) => void;
  llBand: number;
  setLlBand: (n: number) => void;
  fighterRarity: Set<string>;
  toggleFighterRarity: (r: string) => void;
  /** characters allowed as fighters under the current mode and filters */
  fighterPool: number[];
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
  // Owned Zenkai units count as awakened unless explicitly marked "not awakened".
  // A fresh key on purpose: marks saved by older versions are ignored, so everyone starts with all awakened.
  const [notZ, setNotZState] = useState<Set<number>>(() => new Set(read<number[]>('dbl.zenkaiOff', [])));
  const saveNotZ = (n: Set<number>) => { write('dbl.zenkaiOff', [...n]); return n; };
  const boxZenkai = useMemo(() => new Set([...box].filter((id) => db.chars.get(id)?.zenkai && !notZ.has(id))), [box, notZ, db]);
  const toggleBoxZenkai = useCallback((id: number) => setNotZState((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return saveNotZ(n); }), []);
  /** set exactly which box characters are awakened; every other owned Zenkai unit becomes "not awakened" */
  const setBoxZenkai = useCallback((awakened: number[]) => {
    const aw = new Set(awakened);
    setNotZState(saveNotZ(new Set([...box].filter((id) => db.chars.get(id)?.zenkai && !aw.has(id)))));
  }, [box, db]);
  const notAwakened = useMemo(() => [...notZ].filter((id) => box.has(id)), [notZ, box]);
  const resetZenkai = useCallback(() => setNotZState(saveNotZ(new Set())), []);
  const [target, setTargetState] = useState(() => ({ on: false, value: 8000, basis: 'team' as 'team' | 'fighters', ...read<object>('dbl.target', {}) }));
  const setTarget = useCallback((t: Partial<typeof target>) => setTargetState((cur) => { const n = { ...cur, ...t }; write('dbl.target', n); return n; }), []);
  const [evalOpts, setEvalOptsState] = useState<EvalOptions>(() => ({ ...DEFAULT_EVAL, ...read<Partial<EvalOptions>>('dbl.evalOpts', {}) }));
  const setEvalOpts = useCallback((o: Partial<EvalOptions>) => setEvalOptsState((cur) => { const n = { ...cur, ...o }; write('dbl.evalOpts', n); return n; }), []);
  const [history, setHistory] = useState<HistoryEntry[]>(() => read<HistoryEntry[]>('dbl.history', []).filter((h) => h.team.slots.every((m) => !m || db.chars.has(m.charId))));
  const pushHistory = useCallback((e: Omit<HistoryEntry, 'at'>) => setHistory((h) => {
    const key = (t: Team) => t.slots.map((m) => m?.charId ?? '-').join(',') + t.leader;
    const n = [{ ...e, at: new Date().toISOString() }, ...h.filter((x) => key(x.team) !== key(e.team))].slice(0, 20);
    write('dbl.history', n); return n;
  }), []);
  const clearHistory = useCallback(() => { write('dbl.history', []); setHistory([]); }, []);
  const pool = useMemo(() => (boxOnly && box.size ? [...box] : data.characters.map((c) => c.id)), [boxOnly, box, data]);

  const [ruleset, setRulesetState] = useState<'standard' | 'rating'>(() => (data.pvp ? read('dbl.ruleset', 'standard') : 'standard'));
  const setRuleset = (r: 'standard' | 'rating') => { write('dbl.ruleset', r); setRulesetState(r); };
  const [tierFilter, setTierFilter] = useState<Set<TierFilterKey>>(() => new Set(read<TierFilterKey[]>('dbl.tiers', DEFAULT_TIER_FILTER)));
  const toggleTier = (t: TierFilterKey) => setTierFilter((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); write('dbl.tiers', [...n]); return n; });
  const [llBand, setLlBandState] = useState<number>(() => read('dbl.llBand', 1));
  const setLlBand = (n: number) => { write('dbl.llBand', n); setLlBandState(n); };
  const [fighterRarity, setFighterRarity] = useState<Set<string>>(() => new Set(read<string[]>('dbl.fRarity', [])));
  const toggleFighterRarity = (r: string) => setFighterRarity((s) => { const n = new Set(s); n.has(r) ? n.delete(r) : n.add(r); write('dbl.fRarity', [...n]); return n; });
  const fighterPool = useMemo(() => {
    if (ruleset !== 'rating') return pool;
    return pool.filter((id) => {
      if (!tierFilter.has(tierKey(db, id))) return false;
      if (!fighterRarity.size) return true;
      const c = db.char(id);
      return (fighterRarity.has('LL') && c.lf) || fighterRarity.has(c.rarity);
    });
  }, [ruleset, pool, tierFilter, fighterRarity, db]);

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
    pushHistory({ label: `${PRIORITIES.find((p) => p.id === r.priority)?.label ?? 'Generated'} team`, priority: r.priority, team: r.team, locked });
    setCurrent({ team: r.team, priority: r.priority, locked, baseline: r.team, label: `${PRIORITIES.find((p) => p.id === r.priority)?.label ?? 'Generated'} team` });
    go('team');
  }, [locked, go, setCurrent, pushHistory]);

  const [charSheet, openChar] = useState<number | null>(null);
  const [equipSheet, openEquip] = useState<number | null>(null);

  const value: Store = {
    db, origin, runner: runnerRef.current, page, go, box, toggleBox, setBox, boxOnly, setBoxOnly, pool,
    boxZenkai, toggleBoxZenkai, setBoxZenkai, resetZenkai, notAwakened, evalOpts, setEvalOpts, history, pushHistory, clearHistory, target, setTarget,
    ruleset, setRuleset, tierFilter, toggleTier, llBand, setLlBand, fighterRarity, toggleFighterRarity, fighterPool,
    locked, setLocked, priority, setPriority, results, setResults, generating, setGenerating,
    current, setCurrent, openTeam, charSheet, openChar, equipSheet, openEquip,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

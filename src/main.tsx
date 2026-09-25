import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { GameData } from './data/types';
import { loadGameData } from './data/source';
import { StoreProvider } from './state/store';
import './index.css';

function Boot() {
  const [state, setState] = useState<{ data: GameData; origin: 'bundled' | 'supabase' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadGameData().then(setState).catch((e) => setError(String(e))); }, []);
  if (error) return <p className="p-6 text-bad">The character database failed to load: {error}. Reload to try again.</p>;
  if (!state) return <div className="flex min-h-screen items-center justify-center font-display text-2xl text-mute">Loading 711 characters…</div>;
  return <StoreProvider data={state.data} origin={state.origin}><App /></StoreProvider>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Boot /></StrictMode>);

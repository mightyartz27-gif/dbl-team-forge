import { CharacterSheet } from './components/CharacterSheet';
import { BuildPage } from './pages/BuildPage';
import { CharactersPage } from './pages/CharactersPage';
import { ComparePage } from './pages/ComparePage';
import { EquipmentPage, EquipmentSheet } from './pages/EquipmentPage';
import { HomePage } from './pages/HomePage';
import { TeamPage } from './pages/TeamPage';
import { useStore, type Page } from './state/store';

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { id: 'build', label: 'Build', icon: 'M12 2l2.9 6.9L22 9.8l-5.4 4.7L18.2 22 12 18.3 5.8 22l1.6-7.5L2 9.8l7.1-.9z' },
  { id: 'team', label: 'Team', icon: 'M4 5h4v4H4zM10 5h4v4h-4zM16 5h4v4h-4zM5 14h3v3H5zM10.5 14h3v3h-3zM16 14h3v3h-3z' },
  { id: 'characters', label: 'Characters', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0z' },
  { id: 'equipment', label: 'Equipment', icon: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z' },
];

export function App() {
  const { page, go } = useStore();
  return (
    <div className="min-h-screen">
      <header className="hidden border-b border-line md:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button onClick={() => go('home')} className="font-display text-xl font-extrabold tracking-wide">DBL Team Forge</button>
          <nav className="flex gap-1">
            {[...NAV, { id: 'compare' as Page, label: 'Compare', icon: '' }].map((n) => (
              <button key={n.id} onClick={() => go(n.id)} className={`rounded-lg px-3 py-1.5 font-semibold ${page === n.id ? 'bg-panel text-gi' : 'text-mute hover:text-cream'}`}>{n.label}</button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-28 md:pb-12">
        {page === 'home' && <HomePage />}
        {page === 'build' && <BuildPage />}
        {page === 'team' && <TeamPage />}
        {page === 'compare' && <ComparePage />}
        {page === 'characters' && <CharactersPage />}
        {page === 'equipment' && <EquipmentPage />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 backdrop-blur md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label="Main">
        <div className="grid grid-cols-5">
          {NAV.map((n) => {
            const active = page === n.id || (n.id === 'build' && page === 'compare');
            return (
              <button key={n.id} onClick={() => go(n.id)} aria-current={active ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active ? 'text-gi' : 'text-mute'}`}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden><path d={n.icon} /></svg>
                {n.label}
              </button>
            );
          })}
        </div>
      </nav>
      <CharacterSheet />
      <EquipmentSheet />
    </div>
  );
}

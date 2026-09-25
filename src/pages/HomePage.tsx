import { useMemo, useState } from 'react';
import { CharAvatar } from '../components/CharAvatar';
import { emptyFilter, searchChars } from '../lib/search';
import { useStore } from '../state/store';

export function HomePage() {
  const { db, box, setLocked, go, origin } = useStore();
  const [q, setQ] = useState('');
  const hits = useMemo(() => (q.trim() ? searchChars(db, { ...emptyFilter(), q }, box).slice(0, 8) : []), [q, db, box]);
  const fresh = useMemo(() => db.data.characters.filter((c) => c.rarity === 'ULTRA' || c.lf).slice(0, 12), [db]);
  const start = (id: number) => { setLocked([id]); go('build'); };
  const meta = db.data.meta;
  const updated = new Date(meta.fetchedAt).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' });
  return (
    <div className="pt-6">
      <h1 className="font-display text-[2.6rem] font-extrabold uppercase leading-[0.95] tracking-tight">
        Pick one fighter.<br />Get the whole team.
      </h1>
      <p className="mt-3 max-w-md text-mute">
        Fighters, bench, Leader, Zenkai support and equipment, ranked by what actually reaches the three characters who fight — with every number explained.
      </p>
      <div className="relative mt-6">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Who do you want to build around?"
          className="w-full rounded-2xl border-2 border-gi bg-panel px-4 py-4 text-lg text-cream placeholder:text-mute focus:outline-none" aria-label="Search characters" />
        {hits.length > 0 && (
          <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl bg-panel shadow-2xl ring-1 ring-line">
            {hits.map((c) => (
              <li key={c.id}>
                <button onClick={() => start(c.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-panel-2">
                  <CharAvatar c={c} size={40} />
                  <div className="min-w-0"><div className="truncate font-semibold">{c.name}</div><div className="num text-xs text-mute">{c.card}</div></div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="mb-3 mt-8 font-display text-xl font-bold">Newest ULTRA and Legends Limited</h2>
      <div className="scroll-x -mx-4 flex gap-3 px-4 pb-1">
        {fresh.map((c) => (
          <button key={c.id} onClick={() => start(c.id)} className="flex w-20 shrink-0 flex-col items-center gap-1.5 text-center">
            <CharAvatar c={c} size={64} />
            <span className="line-clamp-2 text-[11px] leading-tight text-mute">{c.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-3 md:grid-cols-3">
        <button onClick={() => go('build')} className="rounded-2xl bg-panel p-4 text-left hover:bg-panel-2">
          <div className="font-display text-lg font-bold">Lock up to three</div>
          <p className="text-sm text-mute">Keep the characters you insist on; the rest is found for you.</p>
        </button>
        <button onClick={() => go('team')} className="rounded-2xl bg-panel p-4 text-left hover:bg-panel-2">
          <div className="font-display text-lg font-bold">Check a team you already use</div>
          <p className="text-sm text-mute">Build it by hand, then see what's wasted and what to swap.</p>
        </button>
        <button onClick={() => go('characters')} className="rounded-2xl bg-panel p-4 text-left hover:bg-panel-2">
          <div className="font-display text-lg font-bold">Mark your box</div>
          <p className="text-sm text-mute">{box.size ? `${box.size} characters saved.` : 'Only recommend characters you own.'}</p>
        </button>
      </div>

      <p className="mt-10 text-xs text-mute">
        Database updated {updated}: {meta.counts.characters} characters, {meta.counts.battleEquipment} battle equipment pieces. Data from the dblegends.net community database{origin === 'supabase' ? ', served from Supabase' : ''}.
        Unofficial fan tool, not affiliated with Bandai Namco.
      </p>
    </div>
  );
}

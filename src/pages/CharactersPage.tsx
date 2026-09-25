import { useMemo, useState } from 'react';
import { CharAvatar } from '../components/CharAvatar';
import { FilterBar } from '../components/CharacterPicker';
import { Button, Sheet } from '../components/ui';
import { emptyFilter, searchChars, type CharFilter } from '../lib/search';
import { useStore } from '../state/store';

export function CharactersPage() {
  const { db, box, toggleBox, setBox, openChar } = useStore();
  const [f, setF] = useState<CharFilter>(emptyFilter);
  const [boxMode, setBoxMode] = useState(false);
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const [limit, setLimit] = useState(60);
  const list = useMemo(() => searchChars(db, f, box), [db, f, box]);
  const importCodes = () => {
    const codes = new Set(text.toUpperCase().match(/DBL[\w-]+/g) ?? []);
    const ids = db.data.characters.filter((c) => codes.has(c.card.toUpperCase())).map((c) => c.id);
    setBox([...new Set([...box, ...ids])]);
    setImporting(false); setText('');
    alert(`Added ${ids.length} of ${codes.size} card codes to your box.`);
  };
  return (
    <div className="pt-4">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div><h1 className="font-display text-3xl font-extrabold">Characters</h1><p className="num text-sm text-mute">{list.length} shown, {box.size} in your box</p></div>
        <div className="flex gap-2">
          <Button small kind={boxMode ? 'primary' : 'ghost'} onClick={() => setBoxMode(!boxMode)}>{boxMode ? 'Done' : 'Edit box'}</Button>
        </div>
      </div>
      {boxMode && (
        <div className="mb-3 rounded-xl bg-panel p-3 text-sm">
          Tap characters to mark them as owned. Recommendations can then use only your box.
          <div className="mt-2 flex flex-wrap gap-2">
            <Button small kind="ghost" onClick={() => setImporting(true)}>Import card codes</Button>
            <Button small kind="ghost" onClick={() => setBox([...new Set([...box, ...list.map((c) => c.id)])])}>Add all shown</Button>
            {box.size > 0 && <Button small kind="quiet" onClick={() => confirm('Clear your whole box?') && setBox([])}>Clear box</Button>}
          </div>
        </div>
      )}
      <FilterBar f={f} setF={(x) => { setF(x); setLimit(60); }} />
      <ul className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-6 md:grid-cols-8">
        {list.slice(0, limit).map((c) => (
          <li key={c.id}>
            <button onClick={() => (boxMode ? toggleBox(c.id) : openChar(c.id))} className="flex w-full flex-col items-center gap-1.5 text-center" aria-pressed={boxMode ? box.has(c.id) : undefined}>
              <div className="relative">
                <CharAvatar c={c} size={64} dim={boxMode && !box.has(c.id)} />
                {box.has(c.id) && <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-ok text-[11px] font-black text-ink">✓</span>}
              </div>
              <span className="line-clamp-2 text-[11px] leading-tight text-mute">{c.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {list.length > limit && <div className="mt-4"><Button full kind="ghost" onClick={() => setLimit(limit + 120)}>Show more ({list.length - limit} left)</Button></div>}
      <Sheet open={importing} onClose={() => setImporting(false)} title="Import from card codes">
        <p className="mb-2 text-sm text-mute">Paste any text containing card codes such as DBL30-01S — one per line, comma separated, or copied from a spreadsheet. Screenshot recognition comes later.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="w-full rounded-xl border border-line bg-panel p-3 font-mono text-sm" placeholder={'DBL30-01S\nDBL85-03U'} />
        <div className="mt-3"><Button full onClick={importCodes}>Add to my box</Button></div>
      </Sheet>
    </div>
  );
}

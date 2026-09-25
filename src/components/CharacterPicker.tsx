import { useMemo, useState } from 'react';
import type { Color } from '../data/types';
import { emptyFilter, searchChars, type CharFilter } from '../lib/search';
import { useStore } from '../state/store';
import { CharAvatar, EL_COLOR } from './CharAvatar';
import { Chip, Sheet } from './ui';

export const RARITY_CHIPS = [['ULTRA', 'UL'], ['LL', 'LL'], ['SPARKING', 'SP'], ['EXTREME', 'EX'], ['HERO', 'HE']] as const;
export const COLORS: Color[] = ['RED', 'YEL', 'PUR', 'GRN', 'BLU', 'LGT'];

export function FilterBar({ f, setF, showBox = true }: { f: CharFilter; setF: (f: CharFilter) => void; showBox?: boolean }) {
  const { box } = useStore();
  const toggle = <T,>(s: Set<T>, v: T) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; };
  return (
    <>
      <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Name, card code (DBL30-01S), tag or Episode"
        className="mb-3 w-full rounded-xl border border-line bg-panel px-4 py-3 text-base text-cream placeholder:text-mute focus:border-gi focus:outline-none" autoComplete="off" />
      <div className="scroll-x -mx-4 mb-3 flex gap-2 px-4">
        {RARITY_CHIPS.map(([k, l]) => <Chip key={k} active={f.rarity.has(k)} onClick={() => setF({ ...f, rarity: toggle(f.rarity, k) })}>{l}</Chip>)}
        <Chip active={f.zenkai} onClick={() => setF({ ...f, zenkai: !f.zenkai })}>Zenkai</Chip>
        {showBox && <Chip active={f.boxOnly} onClick={() => setF({ ...f, boxOnly: !f.boxOnly })}>My box ({box.size})</Chip>}
        {COLORS.map((c) => (
          <Chip key={c} active={f.colors.has(c)} tone={EL_COLOR[c]} onClick={() => setF({ ...f, colors: toggle(f.colors, c) })}>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: EL_COLOR[c] }} />{c}
          </Chip>
        ))}
      </div>
    </>
  );
}

export function CharacterPicker({ open, onClose, onPick, title = 'Choose a character', exclude = [] }: { open: boolean; onClose: () => void; onPick: (id: number) => void; title?: string; exclude?: number[] }) {
  const { db, box } = useStore();
  const [f, setF] = useState<CharFilter>(emptyFilter);
  const list = useMemo(() => searchChars(db, f, box).filter((c) => !exclude.includes(c.id)).slice(0, 80), [db, f, box, exclude]);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <FilterBar f={f} setF={setF} />
      <ul className="grid gap-2">
        {list.map((c) => (
          <li key={c.id}>
            <button onClick={() => { onPick(c.id); onClose(); }} className="flex w-full items-center gap-3 rounded-xl bg-panel p-2 text-left hover:bg-panel-2">
              <CharAvatar c={c} size={48} />
              <div className="min-w-0">
                <div className="truncate font-semibold">{c.name}</div>
                <div className="num text-sm text-mute">{c.card}{box.has(c.id) ? '  ✓ in box' : ''}</div>
              </div>
            </button>
          </li>
        ))}
        {!list.length && <li className="p-6 text-center text-mute">No character matches. Try a card code or clear a filter.</li>}
      </ul>
    </Sheet>
  );
}

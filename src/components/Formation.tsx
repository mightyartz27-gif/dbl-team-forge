import type { Team } from '../engine/zAbilities';
import { useStore } from '../state/store';
import { CharAvatar } from './CharAvatar';

/** 3 fighters above, 3 bench below — the core picture of a DBL team. */
export function Formation({ team, onSlot, coverage, size = 'lg', lockedIds = [] }: { team: Team; onSlot?: (i: number) => void; coverage?: number[]; size?: 'lg' | 'sm'; lockedIds?: number[] }) {
  const { db } = useStore();
  const big = size === 'lg' ? 64 : 44, small = size === 'lg' ? 44 : 32;
  const slot = (i: number, px: number) => {
    const m = team.slots[i];
    const c = m ? db.chars.get(m.charId) : null;
    const body = c ? (
      <div className="flex flex-col items-center gap-1.5">
        <CharAvatar c={c} size={px} leader={team.leader === i} />
        {size === 'lg' && (
          <span className="line-clamp-2 w-full text-center text-[11px] leading-tight text-mute">
            {lockedIds.includes(c.id) && <span aria-label="Locked">🔒 </span>}{c.name}
          </span>
        )}
        {coverage && i < 3 && <span className="num text-xs font-semibold" style={{ color: coverage[i] > 0.9 ? 'var(--color-ok)' : coverage[i] > 0.6 ? 'var(--color-warn)' : 'var(--color-bad)' }}>Z {Math.round(coverage[i] * 100)}%</span>}
      </div>
    ) : (
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-line text-2xl text-mute" style={{ width: px, height: px }}>+</div>
        {size === 'lg' && <span className="text-[11px] text-mute">{i < 3 ? 'Fighter' : 'Bench'}</span>}
      </div>
    );
    return onSlot ? (
      <button key={i} onClick={() => onSlot(i)} className="flex-1 rounded-xl p-1 hover:bg-panel-2" aria-label={c ? `Slot ${i + 1}: ${c.name}` : `Add to slot ${i + 1}`}>{body}</button>
    ) : <div key={i} className="flex-1 p-1">{body}</div>;
  };
  return (
    <div>
      <div className="flex items-start justify-between gap-1">{[0, 1, 2].map((i) => slot(i, big))}</div>
      <div className={`${size === 'lg' ? 'mt-3' : 'mt-1.5'} flex items-start justify-between gap-1 border-t border-dashed border-line pt-2`}>
        {[3, 4, 5].map((i) => slot(i, small))}
      </div>
    </div>
  );
}

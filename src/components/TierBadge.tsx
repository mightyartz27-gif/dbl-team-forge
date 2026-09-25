import { TIER_LABEL, TIER_SHORT, tierKey } from '../engine/pvp';
import { useStore } from '../state/store';

/** Official Rating Match tier. Featured is highlighted; Tier C (no bonus) is muted. */
export function TierBadge({ id, short }: { id: number; short?: boolean }) {
  const { db } = useStore();
  if (!db.data.pvp) return null;
  const t = tierKey(db, id);
  const tone = t === 'featured' ? 'bg-gi text-ink' : t === 'C' || t === 'unlisted' ? 'bg-panel-2 text-mute' : 'bg-cream text-ink';
  return (
    <span title={`Rating Match: ${TIER_LABEL[t]}`} className={`num inline-block rounded px-1.5 text-[11px] font-bold leading-4 ${tone}`}>
      {short ? TIER_SHORT[t] : TIER_LABEL[t]}
    </span>
  );
}

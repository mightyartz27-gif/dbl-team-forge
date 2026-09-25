import { useState } from 'react';
import type { Character, Color } from '../data/types';

export const EL_COLOR: Record<Color, string> = {
  RED: 'var(--color-el-red)', YEL: 'var(--color-el-yel)', PUR: 'var(--color-el-pur)',
  GRN: 'var(--color-el-grn)', BLU: 'var(--color-el-blu)', LGT: 'var(--color-el-lgt)',
};
export const RARITY_SHORT: Record<string, string> = { ULTRA: 'UL', SPARKING: 'SP', EXTREME: 'EX', HERO: 'HE', LEGEND: 'LG' };

const ART = (import.meta.env.VITE_ARTWORK_BASE as string | undefined) ?? 'https://dblegends.net/assets/card_icons/';

function initials(name: string) {
  const words = name.replace(/[^A-Za-z0-9#& ]/g, '').split(/\s+/).filter(Boolean);
  const main = words.filter((w) => !/^(Super|Saiyan|God|SS|Form|Full|Power|the|of)$/i.test(w));
  return (main[0]?.[0] ?? words[0]?.[0] ?? '?') + (main[1]?.[0] ?? '');
}

export function CharAvatar({ c, size = 56, leader, dim }: { c: Character; size?: number; leader?: boolean; dim?: boolean }) {
  const [failed, setFailed] = useState(false);
  const ring = c.colors.length > 1 ? `conic-gradient(${EL_COLOR[c.colors[0]]} 0 50%, ${EL_COLOR[c.colors[1]]} 50% 100%)` : EL_COLOR[c.color];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size, opacity: dim ? 0.45 : 1 }}>
      <div className="absolute inset-0 rounded-xl p-[3px]" style={{ background: ring }}>
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[9px] bg-panel-2">
          {c.icon && !failed ? (
            <img src={`${ART}BChaIco_${c.icon}.webp`} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
          ) : (
            <span className="num font-extrabold text-cream" style={{ fontSize: size * 0.36 }}>{initials(c.name)}</span>
          )}
        </div>
      </div>
      {size >= 34 && <span className="num absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md bg-ink px-1 text-[10px] font-bold leading-4 ring-1 ring-line"
        style={{ color: c.lf ? 'var(--color-gi)' : 'var(--color-cream)' }}>
        {c.lf ? 'LL' : RARITY_SHORT[c.rarity] ?? c.rarity}
      </span>}
      {leader && <span aria-label="Leader" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gi text-[11px] font-black text-ink">★</span>}
      {c.zenkai && size >= 34 && <span title="Zenkai" className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-el-yel text-[9px] font-black text-ink">Z</span>}
    </div>
  );
}

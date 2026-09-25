import { useState } from 'react';
import type { StatKey } from '../data/types';
import type { TeamEval } from '../engine/scoring';
import { CORE_STATS, STAT_LABEL, type Bucket } from '../engine/stats';
import type { Team } from '../engine/zAbilities';
import { useStore } from '../state/store';
import { CharAvatar } from './CharAvatar';
import { fmtPct } from './ui';

const EXTRA: StatKey[] = ['dmg', 'dmgStrike', 'dmgBlast', 'dmgSpecial', 'dmgUltimate', 'crit', 'critDmg', 'ki', 'dmgGuard', 'dmgCut', 'heal'];
const sum = (b: Bucket) => b.base + b.pure + b.direct;

export function StatsDashboard({ team, ev }: { team: Team; ev: TeamEval }) {
  const { db } = useStore();
  const fighters = [0, 1, 2].filter((i) => team.slots[i]);
  const [sel, setSel] = useState(fighters[0] ?? 0);
  const ms = ev.sheet.members[sel];
  const m = team.slots[sel];
  if (!ms || !m) return <p className="text-mute">Add fighters to see their stats.</p>;
  const c = db.char(m.charId);
  const extras = EXTRA.filter((k) => sum(ms.stats[k].total) !== 0);
  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-2" role="tablist">
        {fighters.map((i) => {
          const cc = db.char(team.slots[i]!.charId);
          return (
            <button key={i} role="tab" aria-selected={sel === i} onClick={() => setSel(i)}
              className={`flex flex-col items-center gap-1 rounded-xl p-2 ${sel === i ? 'bg-panel-2 ring-2 ring-gi' : 'bg-panel'}`}>
              <CharAvatar c={cc} size={40} leader={team.leader === i} />
              <span className="line-clamp-1 text-[11px] text-mute">{cc.name}</span>
            </button>
          );
        })}
      </div>
      <div className="scroll-x -mx-4 px-4">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-mute">
              <th className="py-2 font-semibold">Stat</th>
              <th className="py-2 text-right font-semibold">Z + Assault</th>
              <th className="py-2 text-right font-semibold">Zenkai</th>
              <th className="py-2 text-right font-semibold">Equipment<div className="text-[10px] font-normal">base / pure / direct</div></th>
              <th className="py-2 text-right font-semibold text-cream">Final</th>
            </tr>
          </thead>
          <tbody>
            {[...CORE_STATS, ...extras].map((k) => {
              const s = ms.stats[k];
              const z = sum(s.bySource.z) + sum(s.bySource.assault), zk = sum(s.bySource.zenkai), e = s.bySource.equip;
              return (
                <tr key={k} className="border-t border-line">
                  <td className="py-2 font-semibold">{STAT_LABEL[k]}</td>
                  <td className="num py-2 text-right">{z ? fmtPct(z) : '—'}</td>
                  <td className="num py-2 text-right">{zk ? fmtPct(zk) : '—'}</td>
                  <td className="num py-2 text-right text-mute">{sum(e) ? `${Math.round(e.base)} / ${Math.round(e.pure)} / ${Math.round(e.direct)}` : '—'}</td>
                  <td className="num py-2 text-right text-base font-bold text-gi">{fmtPct(s.final)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-panel p-3"><div className="text-xs text-mute">Effective Strike output</div><div className="num text-2xl font-bold">{fmtPct(ms.offense.strike)}</div><div className="text-[11px] text-mute">Strike ATK × Damage Inflicted</div></div>
        <div className="rounded-xl bg-panel p-3"><div className="text-xs text-mute">Effective Blast output</div><div className="num text-2xl font-bold">{fmtPct(ms.offense.blast)}</div><div className="text-[11px] text-mute">Blast ATK × Damage Inflicted</div></div>
      </div>
      {c.base && (
        <p className="mt-3 text-xs text-mute">
          Final = (1 + base) × (1 + pure) × (1 + direct) − 1. Same-layer bonuses add; different layers multiply. Z coverage on {c.name}: {Math.round(ms.coverage * 100)}%, Zenkai buffs received: {ms.zenkaiReceived}.
        </p>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import type { TeamEval } from '../engine/scoring';
import { condLabel, type Team } from '../engine/zAbilities';
import { useStore } from '../state/store';
import { CharAvatar } from './CharAvatar';
import { prettyAbility } from '../lib/text';

const SRC_LABEL = { z: 'Z Ability', zenkai: 'Zenkai Z Ability', assault: 'Assault Z Ability' } as const;
const REASON: Record<string, string> = {
  'leader-receives': 'Leader receives all', 'leader-gives': 'Leader privilege', assault: 'Battle member ally',
  condition: '', blocked: '', 'assault-bench': 'Carrier on bench',
};

/** Giver → ability → each teammate: green = 100%, yellow = partial, red = nothing. */
export function ZTree({ team, ev }: { team: Team; ev: TeamEval }) {
  const { db } = useStore();
  const groups = useMemo(() => {
    const map = new Map<string, { giver: number; source: 'z' | 'zenkai' | 'assault'; name: string; text: string; per: Map<number, { tot: number; got: number; reasons: Set<string> }> }>();
    for (const a of ev.sheet.applications) {
      const key = `${a.giver}:${a.source}`;
      if (!map.has(key)) {
        const m = team.slots[a.giver]!;
        const c = db.char(m.charId);
        const lv = a.source === 'z' ? c.z?.[m.zLevel - 1] ?? c.z?.find(Boolean) : a.source === 'zenkai' ? c.zenkaiZ?.filter(Boolean).at(-1) : c.assault?.[m.zLevel - 1];
        map.set(key, { giver: a.giver, source: a.source, name: lv?.name ?? SRC_LABEL[a.source], text: lv?.text ?? '', per: new Map() });
      }
      const g = map.get(key)!;
      const mag = a.line.stats.reduce((s, v) => s + v.value, 0);
      const r = g.per.get(a.recipient) ?? { tot: 0, got: 0, reasons: new Set<string>() };
      r.tot += mag; if (a.applied) { r.got += mag; if (REASON[a.reason]) r.reasons.add(REASON[a.reason]); }
      else if (a.reason === 'assault-bench') r.reasons.add(REASON[a.reason]);
      g.per.set(a.recipient, r);
    }
    return [...map.values()].sort((a, b) => a.giver - b.giver);
  }, [ev, team, db]);

  if (!groups.length) return <p className="text-mute">Add characters to see how their Z Abilities spread.</p>;
  return (
    <ol className="grid gap-3">
      {groups.map((g) => {
        const giver = db.char(team.slots[g.giver]!.charId);
        const lines = team.slots[g.giver] ? (g.source === 'z' ? giver.z : g.source === 'zenkai' ? giver.zenkaiZ : giver.assault)?.filter(Boolean).at(-1)?.lines ?? [] : [];
        return (
          <li key={`${g.giver}${g.source}`} className="min-w-0 rounded-2xl bg-panel p-3">
            <div className="flex items-center gap-3">
              <CharAvatar c={giver} size={40} leader={team.leader === g.giver} />
              <div className="min-w-0">
                <div className="truncate font-semibold">{giver.name} <span className="text-mute">({g.giver < 3 ? 'fighter' : 'bench'})</span></div>
                <div className="text-sm text-gi">{g.name}</div>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line break-words text-sm text-mute">{prettyAbility(g.text)}</p>
            {lines.length > 0 && g.source !== 'assault' && (
              <p className="mt-1 break-words text-xs text-mute">Targets: {lines.map((l) => condLabel(l.cond, db)).filter((v, i, a) => a.indexOf(v) === i).join('; ')}</p>
            )}
            <ul className="mt-3 grid gap-1.5 border-l-2 border-line pl-3">
              {[0, 1, 2, 3, 4, 5].filter((i) => team.slots[i] && g.per.has(i)).map((i) => {
                const r = g.per.get(i)!;
                const f = r.tot ? r.got / r.tot : 0;
                const tone = f >= 0.999 ? 'var(--color-ok)' : f > 0 ? 'var(--color-warn)' : 'var(--color-bad)';
                const rc = db.char(team.slots[i]!.charId);
                return (
                  <li key={i} className="flex items-center gap-2 text-sm" style={{ opacity: i < 3 ? 1 : 0.6 }}>
                    <span aria-hidden className="h-0.5 w-3" style={{ background: tone }} />
                    <span className="min-w-0 flex-1 truncate">{rc.name}{i >= 3 && ' (bench)'}</span>
                    {[...r.reasons].map((x) => <span key={x} className="rounded bg-panel-2 px-1.5 text-[11px] text-mute">{x}</span>)}
                    <span className="num w-12 text-right font-bold" style={{ color: tone }}>{Math.round(f * 100)}%</span>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

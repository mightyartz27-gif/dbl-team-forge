import { CharAvatar } from '../components/CharAvatar';
import { Button, fmtPct } from '../components/ui';
import { PRIORITIES } from '../engine/weights';
import { useStore } from '../state/store';

export function ComparePage() {
  const { results, db, openTeam, go } = useStore();
  if (!results.length) return (
    <div className="pt-6"><h1 className="font-display text-3xl font-extrabold">Compare teams</h1><p className="my-3 text-mute">Generate teams first, then compare them side by side here.</p><Button onClick={() => go('build')}>Go to Build</Button></div>
  );
  const rows: [string, (i: number) => number, 'pct' | 'int' | 'frac', boolean][] = [
    ['Optimizer score', (i) => results[i].evaluation.overall, 'int', true],
    ['Health', (i) => results[i].evaluation.metrics.health, 'pct', true],
    ['Strike ATK', (i) => results[i].evaluation.metrics.strike, 'pct', true],
    ['Blast ATK', (i) => results[i].evaluation.metrics.blast, 'pct', true],
    ['Strike DEF', (i) => results[i].evaluation.metrics.strikeDef, 'pct', true],
    ['Blast DEF', (i) => results[i].evaluation.metrics.blastDef, 'pct', true],
    ['Z coverage', (i) => avg(results[i].evaluation.metrics.coverage) * 100, 'int', true],
    ['Zenkai buffs', (i) => results[i].evaluation.metrics.zenkaiActive, 'int', true],
    ['Health buffs', (i) => results[i].evaluation.metrics.healthBuffs, 'int', true],
    ['Active equipment', (i) => results[i].evaluation.metrics.equipActive, 'frac', true],
    ['Wasted Z Abilities', (i) => results[i].evaluation.metrics.wasted, 'int', false],
  ];
  return (
    <div className="pt-4">
      <h1 className="font-display text-3xl font-extrabold">Compare teams</h1>
      <p className="mb-4 text-sm text-mute">Best value in each row is highlighted. Stats are averages over the three fighters. Scroll sideways on phones.</p>
      <div className="scroll-x -mx-4 px-4">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-ink p-2" />
              {results.map((r, i) => (
                <th key={i} className="min-w-[120px] p-2 text-left align-bottom">
                  <div className="font-display text-base font-bold">{PRIORITIES.find((p) => p.id === r.priority)?.label}</div>
                  <div className="mt-1 flex -space-x-2">{r.team.slots.slice(0, 3).map((m, j) => <CharAvatar key={j} c={db.char(m!.charId)} size={30} leader={r.team.leader === j} />)}</div>
                  <button className="mt-1 text-xs text-gi" onClick={() => openTeam(r)}>Open</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f, kind, higher]) => {
              const vals = results.map((_, i) => f(i));
              const best = higher ? Math.max(...vals) : Math.min(...vals);
              return (
                <tr key={label}>
                  <td className="sticky left-0 z-10 border-t border-line bg-ink p-2 font-semibold">{label}</td>
                  {vals.map((v, i) => (
                    <td key={i} className={`num border-t border-line p-2 text-right text-base ${v === best ? 'font-extrabold text-gi' : ''}`}>
                      {kind === 'pct' ? fmtPct(v) : kind === 'frac' ? `${v}/${results[i].evaluation.metrics.equipConditional}` : Math.round(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

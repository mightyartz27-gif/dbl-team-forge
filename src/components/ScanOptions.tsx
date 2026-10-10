import type { Coverage } from '../engine/weights';
import { useStore } from '../state/store';
import { Chip } from './ui';

function Toggle({ checked, onChange, title, sub }: { checked: boolean; onChange: (b: boolean) => void; title: string; sub: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-panel p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-gi)]" />
      <span><span className="block font-semibold">{title}</span><span className="block text-sm text-mute">{sub}</span></span>
    </label>
  );
}

/** Analysis options shared by the generator (Build) and the team analysis (Team). */
export function ScanOptions({ pvpChecked, onPvp, showDepth }: { pvpChecked: boolean; onPvp: (b: boolean) => void; showDepth?: boolean }) {
  const { evalOpts, setEvalOpts, db } = useStore();
  const pct = Math.round(evalOpts.floor * 100);
  return (
    <div className="grid gap-4">
      <div>
        <div className="mb-1.5 text-sm font-semibold text-mute">Defense coverage</div>
        <div className="flex gap-2">
          {([['both', 'Both'], ['strike', 'Strike'], ['blast', 'Blast']] as [Coverage, string][]).map(([k, l]) => (
            <Chip key={k} active={evalOpts.coverage === k} onClick={() => setEvalOpts({ coverage: k })}>{l}</Chip>
          ))}
        </div>
        <p className="mt-1 text-xs text-mute">Which defense to value: against Strike attacks, Blast attacks, or both.</p>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-sm font-semibold text-mute"><span>Carry</span><span>Team balance</span><span>Balanced</span></div>
        <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setEvalOpts({ floor: +e.target.value / 100 })}
          className="w-full accent-[var(--color-gi)]" aria-label="Team balance" />
        <p className="text-xs text-mute"><span className="num text-cream">{pct}% balanced.</span> Blends the team average with the weakest fighter, so one strong carry can't hide two weak teammates.</p>
      </div>
      {db.data.pvp && <Toggle checked={pvpChecked} onChange={onPvp} title="Apply PvP tier bonus" sub="Adds each fighter's official Rating Match Damage and Guard boost to its stats." />}
      <Toggle checked={evalOpts.zenkaiBench} onChange={(b) => setEvalOpts({ zenkaiBench: b })} title="Prefer Zenkai support on the bench"
        sub="Zenkai Z Abilities count extra when choosing the bench, so Zenkai Awakened units that buff your fighters are picked first." />
      <Toggle checked={evalOpts.cohesion} onChange={(b) => setEvalOpts({ cohesion: b })} title="Reward style cohesion"
        sub="Prefers fighters whose Strike/Blast buffs match their own Strike/Blast stats." />
      {showDepth && (
        <div>
          <div className="mb-1.5 text-sm font-semibold text-mute">Scan depth</div>
          <div className="flex gap-2">
            <Chip active={evalOpts.depth === 'quick'} onClick={() => setEvalOpts({ depth: 'quick' })}>Quick</Chip>
            <Chip active={evalOpts.depth === 'thorough'} onClick={() => setEvalOpts({ depth: 'thorough' })}>Thorough</Chip>
          </div>
          <p className="mt-1 text-xs text-mute">{evalOpts.depth === 'quick' ? 'Best teams in a couple of seconds.' : 'Tests about twice as many candidates; slower on phones.'}</p>
        </div>
      )}
    </div>
  );
}

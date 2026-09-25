import type { GeneratedTeam } from '../engine/generator';
import { PRIORITIES } from '../engine/weights';
import { useStore } from '../state/store';
import { Formation } from './Formation';
import { fmtPct } from './ui';

export function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-panel-2 px-2.5 py-2">
      <div className="truncate text-[11px] text-mute">{label}</div>
      <div className="num text-lg font-bold leading-6" style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  );
}

export function TeamCard({ r, index }: { r: GeneratedTeam; index: number }) {
  const { openTeam, db, locked } = useStore();
  const m = r.evaluation.metrics;
  const p = PRIORITIES.find((x) => x.id === r.priority)!;
  const leader = r.team.leader !== null ? db.char(r.team.slots[r.team.leader]!.charId).name : 'none';
  const cov = m.coverage.reduce((s, x) => s + x, 0) / Math.max(1, m.coverage.length);
  return (
    <article className="flex w-[88vw] max-w-md shrink-0 flex-col rounded-2xl bg-panel p-4 ring-1 ring-line md:w-auto">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="num text-sm text-mute">Team {index + 1}</div>
          <h3 className="font-display text-2xl font-extrabold leading-7">{p.label}</h3>
          <p className="text-sm text-mute">{p.blurb}</p>
        </div>
        <div className="text-right">
          <div className="num text-3xl font-extrabold text-gi">{Math.round(r.evaluation.overall)}</div>
          <div className="text-[11px] text-mute">optimizer score</div>
        </div>
      </header>
      <Formation team={r.team} coverage={m.coverage} size="lg" lockedIds={locked} />
      <p className="mt-2 text-sm text-mute">Leader: <span className="text-cream">{leader}</span></p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Z coverage" value={`${Math.round(cov * 100)}%`} />
        <Metric label="Zenkai active" value={String(m.zenkaiActive)} />
        <Metric label="Health" value={fmtPct(m.health)} />
        <Metric label="Strike ATK" value={fmtPct(m.strike)} />
        <Metric label="Blast ATK" value={fmtPct(m.blast)} />
        <Metric label="DEF avg" value={fmtPct((m.strikeDef + m.blastDef) / 2)} />
      </div>
      <p className="mt-3 text-sm text-mute">
        Equipment: <span className="text-cream">{m.equipPieces}/9 pieces, {m.equipActive}/{m.equipConditional} conditions active</span>
        {m.wasted > 0 && <span className="block text-warn">{m.wasted} Z Abilit{m.wasted > 1 ? 'ies reach' : 'y reaches'} no fighter</span>}
      </p>
      <button onClick={() => openTeam(r)} className="mt-4 w-full rounded-xl bg-gi py-3 font-bold text-ink">Open team</button>
    </article>
  );
}

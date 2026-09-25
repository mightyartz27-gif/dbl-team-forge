import { useMemo, useState } from 'react';
import { prettyAbility } from '../lib/text';
import { benchRanking, diagnose, explain, leaderComparison, suggestSwaps, type Swap } from '../engine/analysis';
import { conditionText } from '../engine/equipment';
import { withOptimizedEquipment } from '../engine/equipOptimizer';
import { evaluateTeam, type TeamEval } from '../engine/scoring';
import { componentWeights, PRIORITIES, type Priority } from '../engine/weights';
import { emptyTeam, newMember, type EquipChoice, type Team } from '../engine/zAbilities';
import { CharAvatar } from '../components/CharAvatar';
import { CharacterPicker } from '../components/CharacterPicker';
import { Formation } from '../components/Formation';
import { StatsDashboard } from '../components/StatsDashboard';
import { Bar, Button, Chip, Panel, Section, Sheet, Tabs, fmtDelta, fmtPct } from '../components/ui';
import { ZTree } from '../components/ZTree';
import { useStore } from '../state/store';

type TabId = 'summary' | 'stats' | 'tree' | 'bench' | 'equipment' | 'leader' | 'improve';
const TABS: { id: TabId; label: string }[] = [
  { id: 'summary', label: 'Summary' }, { id: 'improve', label: 'Improve' }, { id: 'stats', label: 'Stats' }, { id: 'tree', label: 'Z tree' },
  { id: 'bench', label: 'Bench' }, { id: 'equipment', label: 'Equipment' }, { id: 'leader', label: 'Leader' },
];
const COMPONENT_LABEL: Record<string, string> = {
  battleSynergy: 'Battle synergy (shared tags)', zEfficiency: 'Z Ability efficiency', zenkaiEfficiency: 'Zenkai efficiency', healthSupport: 'Health support',
  offense: 'Offense', defense: 'Defense', equipment: 'Equipment', coverage: 'Z coverage', leaderEfficiency: 'Leader efficiency', locked: 'Locked characters',
};

export function TeamPage() {
  const { db, current, setCurrent, results, pool } = useStore();
  const { team, priority, locked, baseline } = current;
  const [tab, setTab] = useState<TabId>('summary');
  const [picking, setPicking] = useState<number | null>(null);
  const [slotMenu, setSlotMenu] = useState<number | null>(null);

  const ev = useMemo(() => evaluateTeam(team, db, priority, locked), [team, db, priority, locked]);
  const baseEv = useMemo(() => (baseline ? evaluateTeam(baseline, db, priority, locked) : null), [baseline, db, priority, locked]);
  const others = useMemo(() => results.map((r) => r.evaluation), [results]);
  const exp = useMemo(() => explain(ev, team, db, others.length ? others : [ev], locked), [ev, team, db, others, locked]);
  const setTeam = (t: Team) => setCurrent((c) => ({ ...c, team: t }));
  const inTeam = team.slots.filter(Boolean).map((m) => m!.charId);
  const filled = team.slots.filter(Boolean).length;

  const putChar = (slot: number, id: number) => {
    const slots = team.slots.map((m, i) => (i === slot ? newMember(id, db.char(id)) : m));
    let leader = team.leader;
    if (leader === null && slot < 3) leader = slot;
    setTeam({ slots, leader });
  };

  return (
    <div>
      <div className="pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-extrabold leading-7">{current.label}</h1>
            <p className="text-xs text-mute">Tap a slot to swap it, lock it or make it Leader</p>
          </div>
          <div className="text-right">
            <div className="num text-3xl font-extrabold leading-8 text-gi">{Math.round(ev.overall)}</div>
            {baseEv && Math.abs(ev.overall - baseEv.overall) >= 0.5 && <div className="num text-xs" style={{ color: ev.overall >= baseEv.overall ? 'var(--color-ok)' : 'var(--color-bad)' }}>{fmtDelta(ev.overall - baseEv.overall, '')} vs start</div>}
          </div>
        </div>
        <Formation team={team} coverage={ev.metrics.coverage} onSlot={(i) => (team.slots[i] ? setSlotMenu(i) : setPicking(i))} lockedIds={locked} />
      </div>

      <div className="mt-3 scroll-x -mx-4 flex gap-2 px-4">
        {PRIORITIES.map((p) => <Chip key={p.id} active={priority === p.id} onClick={() => setCurrent((c) => ({ ...c, priority: p.id }))}>{p.label}</Chip>)}
      </div>
      <p className="mb-3 mt-2 text-xs text-mute">Scores follow the selected priority. The score is this app's optimization metric, not an official game value.</p>

      {filled === 0 ? (
        <Panel><p className="mb-3">Start with any character. Tap a slot above, or generate complete teams from Build.</p><Button onClick={() => setPicking(0)}>Add first fighter</Button></Panel>
      ) : (
        <>
          <div className="sticky z-30 -mx-4 bg-ink/95 px-4 pt-2 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
            <div className="mb-1 flex items-center gap-1.5">
              {team.slots.map((m, i) => m ? <span key={i} className={i === 3 ? 'ml-2' : ''}><CharAvatar c={db.char(m.charId)} size={i < 3 ? 30 : 24} leader={team.leader === i} /></span> : <span key={i} className={`${i === 3 ? 'ml-2' : ''} h-6 w-6 rounded-md border border-dashed border-line`} />)}
              <span className="num ml-auto text-xl font-extrabold text-gi">{Math.round(ev.overall)}</span>
            </div>
            <Tabs tabs={TABS} value={tab} onChange={setTab} />
          </div>
          {tab === 'summary' && <Summary ev={ev} baseEv={baseEv} exp={exp} priority={priority} team={team} />}
          {tab === 'stats' && <StatsDashboard team={team} ev={ev} />}
          {tab === 'tree' && <ZTree team={team} ev={ev} />}
          {tab === 'bench' && <BenchPanel team={team} priority={priority} pool={pool} onSwap={(slot, id) => putChar(slot, id)} />}
          {tab === 'equipment' && <EquipmentPanel team={team} ev={ev} priority={priority} setTeam={setTeam} />}
          {tab === 'leader' && <LeaderPanel team={team} priority={priority} locked={locked} setTeam={setTeam} />}
          {tab === 'improve' && <ImprovePanel team={team} ev={ev} priority={priority} pool={pool} locked={locked} setTeam={setTeam} baseEv={baseEv} />}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button kind="ghost" small onClick={() => setCurrent((c) => ({ ...c, baseline: c.team }))}>Set current as what-if start</Button>
            <Button kind="ghost" small onClick={() => setCurrent({ team: emptyTeam(), priority, locked: [], baseline: null, label: 'My team' })}>Clear team</Button>
          </div>
        </>
      )}

      <CharacterPicker open={picking !== null} onClose={() => setPicking(null)} exclude={inTeam}
        title={picking !== null ? (picking < 3 ? `Fighter ${picking + 1}` : `Bench ${picking - 2}`) : ''} onPick={(id) => picking !== null && putChar(picking, id)} />
      <Sheet open={slotMenu !== null} onClose={() => setSlotMenu(null)} title={slotMenu !== null && team.slots[slotMenu] ? db.char(team.slots[slotMenu]!.charId).name : ''}>
        {slotMenu !== null && team.slots[slotMenu] && (() => {
          const m = team.slots[slotMenu]!;
          const c = db.char(m.charId);
          const isLocked = locked.includes(c.id);
          const update = (patch: Partial<typeof m>) => setTeam({ ...team, slots: team.slots.map((x, i) => (i === slotMenu ? { ...m, ...patch } : x)) });
          return (
            <div className="grid gap-3">
              <div className="flex items-center gap-3"><CharAvatar c={c} size={56} leader={team.leader === slotMenu} /><div className="num text-mute">{c.card}</div></div>
              <div>
                <div className="mb-1 text-sm text-mute">Z Ability level</div>
                <div className="flex gap-2">{([1, 2, 3, 4] as const).map((l) => <Chip key={l} active={m.zLevel === l} onClick={() => update({ zLevel: l })}>{['I', 'II', 'III', 'IV'][l - 1]}</Chip>)}</div>
              </div>
              {c.zenkai && <label className="flex items-center gap-2"><input type="checkbox" checked={m.zenkai} onChange={(e) => update({ zenkai: e.target.checked })} className="h-5 w-5 accent-[var(--color-gi)]" /> Zenkai Awakened (Zenkai Z Ability counted at max)</label>}
              {slotMenu < 3 && <Button kind="ghost" onClick={() => { setTeam({ ...team, leader: slotMenu }); setSlotMenu(null); }}>Make Leader</Button>}
              <Button kind="ghost" onClick={() => setCurrent((cur) => ({ ...cur, locked: isLocked ? cur.locked.filter((x) => x !== c.id) : [...cur.locked, c.id] }))}>{isLocked ? 'Unlock' : 'Lock (never replaced)'}</Button>
              <Button kind="ghost" onClick={() => { setPicking(slotMenu); setSlotMenu(null); }}>Replace</Button>
              <Button kind="ghost" onClick={() => {
                const target = slotMenu < 3 ? [3, 4, 5].find((i) => !team.slots[i]) ?? 3 : [0, 1, 2].find((i) => !team.slots[i]) ?? 0;
                const slots = [...team.slots]; [slots[slotMenu], slots[target]] = [slots[target], slots[slotMenu]];
                setTeam({ slots, leader: team.leader === slotMenu ? null : team.leader }); setSlotMenu(null);
              }}>{slotMenu < 3 ? 'Move to bench' : 'Move to fighters'}</Button>
              <Button kind="quiet" onClick={() => { setTeam({ slots: team.slots.map((x, i) => (i === slotMenu ? null : x)), leader: team.leader === slotMenu ? null : team.leader }); setSlotMenu(null); }}>Remove from team</Button>
            </div>
          );
        })()}
      </Sheet>
    </div>
  );
}

// ------------------------------------------------------------------ summary
function Summary({ ev, baseEv, exp, priority, team }: { ev: TeamEval; baseEv: TeamEval | null; exp: { why: string[]; sacrifices: string[] }; priority: Priority; team: Team }) {
  const { db } = useStore();
  const cw = componentWeights(priority);
  return (
    <>
      {baseEv && baseEv !== ev && <WhatIf before={baseEv} after={ev} />}
      <Section title="Why this team">
        <p className="mb-2 text-sm text-mute">This team scored {Math.round(ev.overall)} on the {PRIORITIES.find((p) => p.id === priority)?.label} criteria. Here is what drives it.</p>
        <ul className="grid gap-1.5">{exp.why.map((w) => <li key={w} className="flex gap-2"><span className="text-ok">✓</span><span>{w}</span></li>)}</ul>
      </Section>
      {exp.sacrifices.length > 0 && (
        <Section title="What is being sacrificed">
          <ul className="grid gap-1.5">{exp.sacrifices.map((w) => <li key={w} className="flex gap-2"><span className="text-warn">−</span><span>{w}</span></li>)}</ul>
        </Section>
      )}
      <Section title="Score breakdown">
        <Panel>
          {(Object.entries(ev.components) as [keyof typeof cw, number][]).filter(([k]) => cw[k] > 0 && !(k === 'locked' && !ev.components.locked)).map(([k, v]) => (
            <Bar key={k} label={`${COMPONENT_LABEL[k]} (weight ${cw[k]})`} value={v} />
          ))}
          {ev.penalty > 0 && <p className="text-sm text-warn">−{ev.penalty} for Z Abilities that reach no fighter</p>}
        </Panel>
      </Section>
      {ev.uncalculated.length > 0 && (
        <Section title="Not calculated">
          <p className="mb-2 text-sm text-mute">These effects matter in battle but can't be reduced to a stat, so they're listed instead of guessed.</p>
          <ul className="grid gap-2">
            {ev.uncalculated.slice(0, 30).map((u, i) => (
              <li key={i} className="rounded-xl bg-panel p-3 text-sm">
                <div className="font-semibold">{db.char(team.slots[u.slot]!.charId).name}: {u.label}</div>
                <div className="line-clamp-3 whitespace-pre-line break-words text-mute">{prettyAbility(u.detail)}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function WhatIf({ before, after }: { before: TeamEval; after: TeamEval }) {
  const rows: [string, number, number, string][] = [
    ['Health', before.metrics.health, after.metrics.health, '%'], ['Strike ATK', before.metrics.strike, after.metrics.strike, '%'],
    ['Blast ATK', before.metrics.blast, after.metrics.blast, '%'], ['Strike DEF', before.metrics.strikeDef, after.metrics.strikeDef, '%'],
    ['Blast DEF', before.metrics.blastDef, after.metrics.blastDef, '%'], ['Zenkai buffs', before.metrics.zenkaiActive, after.metrics.zenkaiActive, ''],
    ['Wasted Z', before.metrics.wasted, after.metrics.wasted, ''], ['Score', before.overall, after.overall, ''],
  ];
  if (rows.every(([, a, b]) => Math.abs(a - b) < 0.5)) return null;
  return (
    <Section title="What if: before and after">
      <Panel>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-mute"><th className="pb-1 font-semibold" /><th className="pb-1 text-right font-semibold">Before</th><th className="pb-1 text-right font-semibold">After</th><th className="pb-1 text-right font-semibold">Change</th></tr></thead>
          <tbody>
            {rows.map(([l, a, b, u]) => {
              const d = b - a;
              const good = l === 'Wasted Z' ? d < 0 : d > 0;
              return (
                <tr key={l} className="border-t border-line">
                  <td className="py-1.5">{l}</td>
                  <td className="num py-1.5 text-right text-mute">{u ? fmtPct(a) : Math.round(a)}</td>
                  <td className="num py-1.5 text-right">{u ? fmtPct(b) : Math.round(b)}</td>
                  <td className="num py-1.5 text-right font-bold" style={{ color: Math.abs(d) < 0.5 ? 'var(--color-mute)' : good ? 'var(--color-ok)' : 'var(--color-bad)' }}>{fmtDelta(d, u)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </Section>
  );
}

// ------------------------------------------------------------------ bench
function BenchPanel({ team, priority, pool, onSwap }: { team: Team; priority: Priority; pool: number[]; onSwap: (slot: number, id: number) => void }) {
  const { db } = useStore();
  const { chosen, alternatives } = useMemo(() => benchRanking(team, db, priority, pool, 10), [team, db, priority, pool]);
  const [target, setTarget] = useState<number | null>(null);
  const fighters = [0, 1, 2].filter((i) => team.slots[i]);
  const name = (i: number) => db.char(team.slots[i]!.charId).name;
  if (!fighters.length) return <p className="text-mute">Pick fighters first: the bench is judged by what reaches them.</p>;
  const weakest = [3, 4, 5].map((s) => ({ s, v: chosen.find((c) => c.charId === team.slots[s]?.charId)?.useful ?? -1 })).sort((a, b) => a.v - b.v)[0]?.s ?? 3;
  return (
    <>
      <Section title="Current bench">
        <p className="mb-2 text-sm text-mute">Judged only by the buffs that reach the three fighters — not by total Ability Bonus.</p>
        <ul className="grid gap-2">
          {chosen.map((b) => (
            <li key={b.charId} className="rounded-xl bg-panel p-3">
              <div className="flex items-center gap-3">
                <CharAvatar c={db.char(b.charId)} size={44} />
                <div className="min-w-0 flex-1"><div className="truncate font-semibold">{db.char(b.charId).name}</div>
                  <div className="text-sm text-mute">Buffs {b.receivers.map(name).join(', ') || 'no fighter'}</div></div>
                <div className="num text-lg font-bold">{Math.round(b.useful)}</div>
              </div>
              <ul className="mt-2 text-sm">{b.reasons.map((r) => <li key={r} className="text-mute">• {r}</li>)}</ul>
            </li>
          ))}
          {!chosen.length && <li className="text-mute">Bench is empty.</li>}
        </ul>
      </Section>
      <Section title="Bench alternatives" aside={<span className="text-xs text-mute">useful value</span>}>
        <ul className="grid gap-2">
          {alternatives.map((b) => (
            <li key={b.charId} className="rounded-xl bg-panel p-3">
              <div className="flex items-center gap-3">
                <CharAvatar c={db.char(b.charId)} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{db.char(b.charId).name}</div>
                  <div className="text-sm text-mute">Compatible with {b.receivers.length}/{fighters.length} fighters{b.zenkai ? ', +1 Zenkai buff' : ''}{b.health ? `, +${Math.round(b.health)}% Health` : ''}</div>
                </div>
                <div className="num text-lg font-bold">{Math.round(b.useful)}</div>
              </div>
              <ul className="mt-2 text-sm text-mute">{b.reasons.slice(0, 3).map((r) => <li key={r}>• {r}</li>)}</ul>
              {b.whyNot && <p className="mt-1 text-sm"><span className="text-mute">Why not #1: </span>{b.whyNot}</p>}
              <div className="mt-2"><Button small kind="ghost" onClick={() => setTarget(b.charId)}>Put on bench</Button></div>
            </li>
          ))}
        </ul>
      </Section>
      <Sheet open={target !== null} onClose={() => setTarget(null)} title="Replace which bench member?">
        <div className="grid gap-2">
          {[3, 4, 5].map((s) => (
            <Button key={s} kind={s === weakest ? 'primary' : 'ghost'} onClick={() => { onSwap(s, target!); setTarget(null); }}>
              {team.slots[s] ? `Replace ${db.char(team.slots[s]!.charId).name}${s === weakest ? ' (weakest)' : ''}` : `Empty bench slot ${s - 2}`}
            </Button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

// ------------------------------------------------------------------ equipment
function EquipmentPanel({ team, ev, priority, setTeam }: { team: Team; ev: TeamEval; priority: Priority; setTeam: (t: Team) => void }) {
  const { db, openEquip } = useStore();
  const [pick, setPick] = useState<{ slot: number; piece: number } | null>(null);
  const [q, setQ] = useState('');
  const setChoice = (slot: number, piece: number, choice: EquipChoice | null) =>
    setTeam({ ...team, slots: team.slots.map((m, i) => (i === slot && m ? { ...m, equipment: m.equipment.map((e, j) => (j === piece ? choice : e)) } : m)) });
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-mute">{ev.metrics.equipActive}/{ev.metrics.equipConditional} conditions active. Values assume max rolls unless you enter yours.</p>
        <Button small onClick={() => setTeam(withOptimizedEquipment(team, db, priority))}>Optimize all</Button>
      </div>
      {[0, 1, 2].filter((i) => team.slots[i]).map((slot) => {
        const m = team.slots[slot]!;
        const c = db.char(m.charId);
        const ms = ev.sheet.members[slot];
        return (
          <Section key={slot} title={c.name}>
            <div className="grid gap-2">
              {[0, 1, 2].map((piece) => {
                const choice = m.equipment[piece];
                const eq = choice ? db.equips.get(choice.equipId) : null;
                const evals = ms?.equip[piece] ?? [];
                return (
                  <Panel key={piece} className="p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <button className="min-w-0 flex-1 text-left" onClick={() => eq && openEquip(eq.id)}>
                        <div className="text-xs text-mute">Slot {piece + 1}</div>
                        <div className="break-words font-semibold">{eq ? eq.name : 'Empty'}</div>
                        {eq && <div className="text-xs capitalize text-mute">{eq.rarity.replace('awakened', 'awakened ')}{eq.exclusive ? ', card exclusive' : ''}</div>}
                      </button>
                      <div className="flex shrink-0 gap-1">
                        <Button small kind="ghost" onClick={() => setPick({ slot, piece })}>{eq ? 'Change' : 'Add'}</Button>
                        {eq && <Button small kind="quiet" onClick={() => setChoice(slot, piece, null)}>Remove</Button>}
                      </div>
                    </div>
                    {eq && choice && eq.slots.map((s, si) => (
                      <div key={si} className="border-t border-line py-2 text-sm">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-xs text-mute">Line {si + 1}</span>
                          <div className="flex items-center gap-2">
                            {s.options.length > 1 && (
                              <select value={choice.options[si] ?? 0} aria-label="Roll option"
                                onChange={(e) => setChoice(slot, piece, { ...choice, options: choice.options.map((o, j) => (j === si ? +e.target.value : o)) })}
                                className="max-w-[9rem] rounded-lg border border-line bg-panel-2 px-2 py-1 text-xs">
                                {s.options.map((o, oi) => <option key={oi} value={oi}>{o.lines[0]?.raw.slice(0, 40)}</option>)}
                              </select>
                            )}
                            <label className="flex items-center gap-1 text-xs text-mute">Roll
                              <input type="number" inputMode="decimal" step="0.5" placeholder="max"
                                value={choice.values?.[si] ?? ''} onChange={(e) => {
                                  const v = e.target.value === '' ? null : +e.target.value;
                                  const values = [0, 1, 2].map((j) => (j === si ? v : choice.values?.[j] ?? null));
                                  setChoice(slot, piece, { ...choice, values });
                                }} className="w-14 rounded-lg border border-line bg-panel-2 px-1.5 py-1 text-right text-cream" />
                            </label>
                          </div>
                        </div>
                        {evals.filter((e) => e.slot === si).map((e, k) => (
                          <div key={k} className="flex items-start justify-between gap-2">
                            <span className={`min-w-0 break-words ${e.calculable ? '' : 'text-mute'}`}>{e.line.raw}</span>
                            <span className="num shrink-0 text-right text-xs font-bold" style={{ color: !e.calculable ? 'var(--color-mute)' : e.active ? 'var(--color-ok)' : 'var(--color-bad)' }}>
                              {!e.calculable ? 'Not calculated' : !e.line.cond ? `+${e.value}%` : e.active ? `ACTIVE ✓${e.required ? ` ${e.current}/${e.required}` : e.multiplier ? ` ×${e.multiplier}` : ''}` : `INACTIVE ✕${e.required ? ` ${e.current}/${e.required}` : ''}`}
                            </span>
                          </div>
                        ))}
                        {evals.filter((e) => e.slot === si && e.line.cond && !e.active && e.missing).map((e, k) => (
                          <div key={`m${k}`} className="text-xs text-warn">Needs {conditionText(e.line, db)} — missing {e.missing}</div>
                        ))}
                      </div>
                    ))}
                  </Panel>
                );
              })}
            </div>
          </Section>
        );
      })}
      <Sheet open={pick !== null} onClose={() => { setPick(null); setQ(''); }} title="Compatible equipment">
        {pick && (() => {
          const m = team.slots[pick.slot]!;
          const ids = (db.equipFor.get(m.charId) ?? []).filter((id) => db.equips.get(id)?.battle);
          const list = ids.map((id) => db.equips.get(id)!).filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 120);
          return (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${ids.length} pieces`} className="mb-3 w-full rounded-xl border border-line bg-panel px-4 py-3" />
              <ul className="grid gap-2">
                {list.map((e) => (
                  <li key={e.id}>
                    <button className="w-full rounded-xl bg-panel p-3 text-left hover:bg-panel-2" onClick={() => { setChoice(pick.slot, pick.piece, { equipId: e.id, options: e.slots.map(() => 0) }); setPick(null); setQ(''); }}>
                      <div className="font-semibold">{e.name} <span className="text-xs capitalize text-mute">{e.rarity}</span></div>
                      <div className="line-clamp-2 text-xs text-mute">{e.slots.map((s) => s.options[0]?.lines[0]?.raw).filter(Boolean).join(' | ')}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          );
        })()}
      </Sheet>
    </>
  );
}

// ------------------------------------------------------------------ leader
function LeaderPanel({ team, priority, locked, setTeam }: { team: Team; priority: Priority; locked: number[]; setTeam: (t: Team) => void }) {
  const { db } = useStore();
  const opts = useMemo(() => leaderComparison(team, db, priority, locked), [team, db, priority, locked]);
  if (!opts.length) return <p className="text-mute">Add fighters to compare Leaders.</p>;
  return (
    <>
      <p className="mb-3 text-sm text-mute">The Leader receives every Z Ability in the team unconditionally, and its own Z Ability reaches its two trio mates unconditionally. Each fighter was tested as Leader.</p>
      <ul className="grid gap-2">
        {opts.map((o, rank) => {
          const isCur = team.leader === o.slot;
          const d = o.delta;
          return (
            <li key={o.slot} className={`rounded-xl p-3 ${isCur ? 'bg-panel-2 ring-2 ring-gi' : 'bg-panel'}`}>
              <div className="flex items-center gap-3">
                <CharAvatar c={db.char(o.charId)} size={44} leader={isCur} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{db.char(o.charId).name}</div>
                  <div className="text-sm text-mute">{isCur ? 'Current Leader' : rank === 0 ? 'Highest scoring Leader' : 'Alternative'}</div>
                </div>
                <div className="num text-2xl font-bold">{Math.round(o.evaluation.overall)}</div>
              </div>
              {!isCur && (
                <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                  {([['Strike ATK', d.strike], ['Blast ATK', d.blast], ['Health', d.health], ['Strike DEF', d.strikeDef], ['Blast DEF', d.blastDef], ['Zenkai', d.zenkai]] as const).map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-ink py-1"><div className="text-mute">{l}</div><div className="num font-bold" style={{ color: v > 0.5 ? 'var(--color-ok)' : v < -0.5 ? 'var(--color-bad)' : undefined }}>{l === 'Zenkai' ? fmtDelta(v, '') : fmtDelta(v)}</div></div>
                  ))}
                </div>
              )}
              {!isCur && <div className="mt-2"><Button small kind="ghost" onClick={() => setTeam({ ...team, leader: o.slot })}>Make Leader</Button></div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ improve
function ImprovePanel({ team, ev, priority, pool, locked, setTeam, baseEv }: { team: Team; ev: TeamEval; priority: Priority; pool: number[]; locked: number[]; setTeam: (t: Team) => void; baseEv: TeamEval | null }) {
  const { db, setCurrent } = useStore();
  const problems = useMemo(() => diagnose(team, ev, db), [team, ev, db]);
  const [swaps, setSwaps] = useState<Swap[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => { setBusy(true); setTimeout(() => { setSwaps(suggestSwaps(team, db, priority, pool, locked)); setBusy(false); }, 20); };
  return (
    <>
      {baseEv && <WhatIf before={baseEv} after={ev} />}
      <Section title="Problems detected">
        {problems.length ? (
          <ul className="grid gap-1.5">{problems.map((p, i) => <li key={i} className="flex gap-2 text-sm"><span className={p.level === 'warn' ? 'text-warn' : 'text-mute'}>{p.level === 'warn' ? '⚠' : 'ℹ'}</span><span>{p.text}</span></li>)}</ul>
        ) : <p className="text-ok">No problems found for this priority.</p>}
      </Section>
      <Section title="Suggested changes">
        <p className="mb-3 text-sm text-mute">Tests the strongest single replacement for every unlocked slot and keeps the ones that raise the score.</p>
        {!swaps && <Button onClick={run} disabled={busy}>{busy ? 'Testing replacements…' : 'Optimize team'}</Button>}
        {swaps && !swaps.length && <p className="text-mute">No single swap improves this team under the current priority.</p>}
        <ul className="grid gap-2">
          {swaps?.map((s) => {
            const m = s.evaluation.metrics, b = ev.metrics;
            return (
              <li key={`${s.slot}-${s.toId}`} className="rounded-xl bg-panel p-3">
                <div className="mb-2 text-sm text-mute">{s.slot < 3 ? `Fighter ${s.slot + 1}` : `Bench ${s.slot - 2}`}</div>
                <div className="flex items-center gap-2">
                  {s.fromId !== null && <><CharAvatar c={db.char(s.fromId)} size={40} dim /><span className="text-mute">→</span></>}
                  <CharAvatar c={db.char(s.toId)} size={40} />
                  <div className="min-w-0 flex-1 truncate font-semibold">{db.char(s.toId).name}</div>
                  <div className="num text-lg font-bold text-ok">{fmtDelta(s.gain, '')}</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {([['Health', m.health - b.health, '%'], ['Strike ATK', m.strike - b.strike, '%'], ['Blast ATK', m.blast - b.blast, '%'], ['Zenkai', m.zenkaiActive - b.zenkaiActive, ''], ['Wasted Z', b.wasted - m.wasted, '']] as const)
                    .filter(([, v]) => Math.abs(v) >= 0.5).map(([l, v, u]) => <span key={l} style={{ color: v > 0 ? 'var(--color-ok)' : 'var(--color-bad)' }}>{l === 'Wasted Z' ? `${fmtDelta(-v, '')} wasted` : `${fmtDelta(v, u)} ${l}`}</span>)}
                </div>
                <div className="mt-2"><Button small onClick={() => { setCurrent((c) => ({ ...c, baseline: c.baseline ?? team })); setTeam(s.team); setSwaps(null); }}>Apply swap</Button></div>
              </li>
            );
          })}
        </ul>
      </Section>
      <p className="text-xs text-mute">Stat changes are averages over the three fighters.</p>
    </>
  );
}

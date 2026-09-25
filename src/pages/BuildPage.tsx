import { useEffect, useRef, useState } from 'react';
import { CharAvatar } from '../components/CharAvatar';
import { CharacterPicker } from '../components/CharacterPicker';
import { TeamCard } from '../components/TeamCard';
import { Button, Chip, Section } from '../components/ui';
import { PRIORITIES, attackType, type Priority } from '../engine/weights';
import { TIERS, TIER_LABEL, tierKey, type TierFilterKey } from '../engine/pvp';
import { TierBadge } from '../components/TierBadge';
import { RARITY_CHIPS } from '../components/CharacterPicker';
import { useStore } from '../state/store';

export function BuildPage() {
  const { db, locked, setLocked, priority, setPriority, results, setResults, generating, setGenerating, runner, pool, boxOnly, setBoxOnly, box, go, ruleset, setRuleset, tierFilter, toggleTier, llBand, setLlBand, fighterRarity, toggleFighterRarity, fighterPool } = useStore();
  const pvp = db.data.pvp;
  const rating = ruleset === 'rating' && !!pvp;
  const canRun = locked.length > 0 || rating;
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const firstShown = useRef(false);
  useEffect(() => {
    if (generating && results.length === 1 && !firstShown.current) { firstShown.current = true; resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (!generating) firstShown.current = false;
  }, [results.length, generating]);

  const archetypes = (): Priority[] => {
    const focus = locked[0] !== undefined ? attackType(db.char(locked[0])) : 'mixed';
    const offense: Priority = focus === 'blast' ? 'blast' : focus === 'strike' ? 'strike' : 'damage';
    const list: Priority[] = [priority, 'balanced', 'zability', 'zenkai', 'health', offense, 'tags'];
    return [...new Set(list)];
  };

  const generate = async () => {
    setError(null); setResults([]); setGenerating(true);
    try {
      await runner.generate(locked, pool, archetypes(), (r) => setResults((prev) => [...prev, r]), rating ? { fighterPool, ruleset: 'rating', llBand } : { ruleset: 'standard' });
    } catch (e) { setError((e as Error).message); }
    setGenerating(false);
  };

  return (
    <div className="pt-4">
      <h1 className="font-display text-3xl font-extrabold">Build teams</h1>
      <p className="mb-4 text-mute">Locked characters always fight. Everything else — the other fighters, the bench, the Leader and equipment — is searched for you.</p>

      {pvp && (
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-panel p-1" role="radiogroup" aria-label="Game mode">
          {(['standard', 'rating'] as const).map((r) => (
            <button key={r} role="radio" aria-checked={ruleset === r} onClick={() => { setRuleset(r); setResults([]); }}
              className={`rounded-xl py-2.5 font-display text-lg font-bold ${ruleset === r ? 'bg-gi text-ink' : 'text-mute'}`}>
              {r === 'standard' ? 'Standard' : 'Rating Match (PvP)'}
            </button>
          ))}
        </div>
      )}

      {rating && pvp && (
        <Section title="Rating Match tiers">
          <p className="mb-3 text-sm text-mute">
            Official tier list for the season starting {pvp.seasonStart} (<a className="text-gi underline" href={pvp.url} target="_blank" rel="noreferrer">source</a>).
            Tier bonuses are counted in every stat. Fighters come only from the tiers you pick; the bench is still chosen for its Z Abilities, because tier bonuses apply only while fighting.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {([...TIERS, 'unlisted'] as TierFilterKey[]).map((t) => {
              const n = pool.filter((id) => tierKey(db, id) === t).length;
              const b = t !== 'unlisted' ? pvp.bonus[t]?.pre : null;
              return (
                <Chip key={t} active={tierFilter.has(t)} onClick={() => toggleTier(t)}>
                  {TIER_LABEL[t]} <span className="num opacity-70">{n}{b && (b.dmg || b.guard) ? `, +${b.dmg}%` : ''}</span>
                </Chip>
              );
            })}
          </div>
          <div className="mb-3">
            <div className="mb-1 text-sm text-mute">Fighter rarity (optional)</div>
            <div className="flex flex-wrap gap-2">{RARITY_CHIPS.map(([k, l]) => <Chip key={k} active={fighterRarity.has(k)} onClick={() => toggleFighterRarity(k)}>{l}</Chip>)}</div>
          </div>
          <label className="mb-2 block text-sm">
            <span className="text-mute">Your LEGENDS LIMITED stars (Featured LL bonus)</span>
            <select value={llBand} onChange={(e) => setLlBand(+e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2.5">
              {pvp.llBands.map((b, i) => <option key={i} value={i}>{b.stars}: +{b.value}% base stats</option>)}
            </select>
          </label>
          <p className="text-sm text-mute"><span className="num text-cream">{fighterPool.length}</span> fighters allowed. Stats reward the big tier bonuses of Tiers Z and S; kit strength itself isn't calculated, so lock the units you trust or use the rarity filter.</p>
        </Section>
      )}

      <Section title="Locked fighters" aside={<span className="num text-sm text-mute">{locked.length}/3</span>}>
        <div className="flex gap-3">
          {locked.map((id) => {
            const c = db.char(id);
            return (
              <div key={id} className="flex w-24 flex-col items-center gap-1 text-center">
                <CharAvatar c={c} size={64} />
                <span className="line-clamp-2 text-[11px] leading-tight">{c.name}</span>
                {rating && <TierBadge id={id} />}
                {rating && !fighterPool.includes(id) && <span className="text-[10px] text-warn">outside your tiers, kept</span>}
                <button className="text-xs text-gi" onClick={() => setLocked(locked.filter((x) => x !== id))}>Unlock</button>
              </div>
            );
          })}
          {locked.length < 3 && (
            <button onClick={() => setPicking(true)} className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-line text-2xl text-mute hover:border-gi" aria-label="Lock a character">+</button>
          )}
        </div>
      </Section>

      <Section title="Optimize for">
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => <Chip key={p.id} active={priority === p.id} onClick={() => setPriority(p.id)}>{p.label}</Chip>)}
        </div>
        <p className="mt-2 text-sm text-mute">{PRIORITIES.find((p) => p.id === priority)?.blurb} You'll also get balanced, Z Ability, Zenkai, Health, offense and tag-synergy variants to compare.</p>
      </Section>

      <label className="mb-5 flex items-center gap-3 rounded-xl bg-panel p-3">
        <input type="checkbox" checked={boxOnly} onChange={(e) => setBoxOnly(e.target.checked)} className="h-5 w-5 accent-[var(--color-gi)]" disabled={!box.size} />
        <span>
          <span className="font-semibold">Only characters I own</span>
          <span className="block text-sm text-mute">{box.size ? `${box.size} in your box` : 'Mark characters as owned on the Characters tab first.'}</span>
        </span>
      </label>

      <Button full onClick={generate} disabled={!canRun || generating}>
        {generating ? `Searching… ${results.length} teams found` : locked.length ? 'Find best teams' : rating ? 'Suggest PvP teams for me' : 'Lock at least one character'}
      </Button>
      {rating && !locked.length && !generating && <p className="mt-2 text-sm text-mute">No lock needed in Rating Match mode: the search picks all three fighters from your tiers.</p>}
      {error && <p className="mt-3 text-bad">Search stopped: {error}</p>}

      {results.length > 0 && (
        <>
          <div ref={resultsRef} className="mb-3 mt-8 flex scroll-mt-4 items-baseline justify-between">
            <h2 className="font-display text-2xl font-extrabold">Recommended teams</h2>
            <Button small kind="quiet" onClick={() => go('compare')}>Compare all</Button>
          </div>
          <p className="mb-3 text-sm text-mute">
            Searched {pool.length} characters{locked.length ? ` around ${locked.map((id) => db.char(id).name).join(', ')}` : ''}{rating ? `, fighters from ${fighterPool.length} tier-eligible characters` : ''}. Each team scored highest for its criteria; swipe to compare.
          </p>
          <div className="scroll-x snap-x-cards -mx-4 flex gap-3 px-4 pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-3">
            {results.map((r, i) => <TeamCard key={i} r={r} index={i} />)}
          </div>
        </>
      )}
      <CharacterPicker open={picking} onClose={() => setPicking(false)} exclude={locked} title="Lock a fighter" onPick={(id) => setLocked([...locked, id])} />
    </div>
  );
}

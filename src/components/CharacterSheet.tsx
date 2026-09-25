import type { ZLevel } from '../data/types';
import { newMember } from '../engine/zAbilities';
import { attackType } from '../engine/weights';
import { useStore } from '../state/store';
import { CharAvatar } from './CharAvatar';
import { prettyAbility } from '../lib/text';
import { TIER_LABEL, tierKey } from '../engine/pvp';
import { Button, Sheet } from './ui';

const KIND_LABEL: Record<string, string> = { class: 'Tags', episode: 'Episode', character: 'Character', style: 'Battle style', rarity: 'Rarity', color: 'Color', card: 'Card', other: 'Other' };

function AbilityBlock({ title, levels }: { title: string; levels: (ZLevel | null)[] | null }) {
  const lv = levels?.filter(Boolean) as ZLevel[] | undefined;
  if (!lv?.length) return null;
  const top = lv[lv.length - 1];
  return (
    <div className="mb-3 rounded-xl bg-panel p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold text-gi">{title}</span>
        <span className={`text-xs ${top.parsed ? 'text-ok' : 'text-warn'}`}>{top.parsed ? 'Calculated' : 'Not calculated'}</span>
      </div>
      <p className="whitespace-pre-line break-words text-sm">{prettyAbility(top.text)}</p>
      {lv.length > 1 && (
        <details className="mt-2 text-sm text-mute"><summary className="cursor-pointer">Lower levels</summary>
          {lv.slice(0, -1).map((l) => <p key={l.name} className="mt-1 whitespace-pre-line"><span className="text-cream">{l.name}: </span>{prettyAbility(l.text)}</p>)}
        </details>
      )}
    </div>
  );
}

export function CharacterSheet() {
  const { charSheet, openChar, db, box, toggleBox, setLocked, locked, go, setCurrent, current } = useStore();
  const c = charSheet !== null ? db.chars.get(charSheet) : null;
  const byKind = new Map<string, string[]>();
  c?.tags.forEach((t) => { const tg = db.tags.get(t); if (!tg || tg.kind === 'card') return; const k = KIND_LABEL[tg.kind]; byKind.set(k, [...(byKind.get(k) ?? []), tg.name]); });
  const addToTeam = () => {
    if (!c) return;
    const slot = current.team.slots.findIndex((m) => !m);
    if (slot < 0) return;
    setCurrent((cur) => ({ ...cur, team: { slots: cur.team.slots.map((m, i) => (i === slot ? newMember(c.id, c) : m)), leader: cur.team.leader ?? (slot < 3 ? slot : null) } }));
    openChar(null); go('team');
  };
  return (
    <Sheet open={!!c} onClose={() => openChar(null)} title={c?.name}>
      {c && (
        <>
          <div className="mb-4 flex items-center gap-4">
            <CharAvatar c={c} size={80} />
            <div className="text-sm">
              <div className="num text-base">{c.card}</div>
              <div className="text-mute">{c.lf ? 'Legends Limited ' : ''}{c.rarity}, {c.colors.join(' / ')}</div>
              <div className="text-mute">Mostly {attackType(c) === 'mixed' ? 'Strike and Blast' : attackType(c) === 'strike' ? 'Strike' : 'Blast'} by base stats{c.zenkai ? ', Zenkai available' : ''}</div>
            </div>
          </div>
          {db.data.pvp && (() => {
            const t = tierKey(db, c.id);
            const b = t !== 'unlisted' ? db.data.pvp!.bonus[t] : null;
            return (
              <div className="mb-4 rounded-xl bg-panel p-3 text-sm">
                <div className="font-semibold">Rating Match: {TIER_LABEL[t]}</div>
                <div className="text-mute">
                  {b ? `+${b.pre.dmg}% damage, +${b.pre.guard}% guard${b.pre.llBonus && c.lf ? ', plus the LL base-stat bonus' : ''}${c.zenkai ? `; after Zenkai +${b.post.dmg}% / +${b.post.guard}%` : ''}.` : "Not on the published list; check in game."}
                </div>
              </div>
            );
          })()}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Button onClick={() => { setLocked([...new Set([...locked, c.id])].slice(-3)); openChar(null); go('build'); }}>Build around</Button>
            <Button kind="ghost" onClick={addToTeam}>Add to my team</Button>
            <Button kind="ghost" onClick={() => toggleBox(c.id)}>{box.has(c.id) ? '✓ In my box' : 'Add to my box'}</Button>
          </div>
          {[...byKind].map(([k, names]) => (
            <div key={k} className="mb-2 text-sm"><span className="text-mute">{k}: </span>{names.join(', ')}</div>
          ))}
          <div className="mt-4">
            <AbilityBlock title="Z Ability" levels={c.z} />
            <AbilityBlock title="Zenkai Z Ability" levels={c.zenkaiZ} />
            <AbilityBlock title="Assault Z Ability (battle member only)" levels={c.assault} />
          </div>
          {c.traits.length > 0 && (
            <div className="mt-2 text-sm"><div className="mb-1 font-semibold">Battle traits (not calculated)</div>
              <ul className="grid gap-1">{c.traits.map((t) => <li key={t.name}><span className="text-cream">{t.name}</span> <span className="text-mute">{t.text}</span></li>)}</ul>
            </div>
          )}
          {c.base && <p className="num mt-4 text-xs text-mute">Max stats (source): HP {c.base.hp.toLocaleString()}, Strike ATK {c.base.sa.toLocaleString()}, Blast ATK {c.base.ba.toLocaleString()}, Strike DEF {c.base.sd.toLocaleString()}, Blast DEF {c.base.bd.toLocaleString()}</p>}
        </>
      )}
    </Sheet>
  );
}

import { useMemo, useState } from 'react';
import { CharAvatar } from '../components/CharAvatar';
import { Chip, Sheet } from '../components/ui';
import { conditionText } from '../engine/equipment';
import { useStore } from '../state/store';

const RARITIES = ['platinum', 'awakenedunique', 'unique', 'awakenedgold', 'gold', 'event'];
const RLABEL: Record<string, string> = { platinum: 'Platinum', awakenedunique: 'Awakened Unique', unique: 'Unique', awakenedgold: 'Awakened Gold', gold: 'Gold', event: 'Event' };

export function EquipmentPage() {
  const { db, openEquip } = useStore();
  const [q, setQ] = useState('');
  const [rar, setRar] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  const list = useMemo(() => db.data.equipment.filter((e) => (!rar || e.rarity === rar) && (!q || e.name.toLowerCase().includes(q.toLowerCase()) || e.slots.some((s) => s.options.some((o) => o.lines.some((l) => l.raw.toLowerCase().includes(q.toLowerCase())))))), [db, q, rar]);
  return (
    <div className="pt-4">
      <h1 className="font-display text-3xl font-extrabold">Equipment</h1>
      <p className="num mb-3 text-sm text-mute">{list.length} battle pieces</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or effect (e.g. Base Health, Saiyan)" className="mb-3 w-full rounded-xl border border-line bg-panel px-4 py-3 text-base placeholder:text-mute focus:border-gi focus:outline-none" />
      <div className="scroll-x -mx-4 mb-3 flex gap-2 px-4">
        <Chip active={!rar} onClick={() => setRar(null)}>All</Chip>
        {RARITIES.map((r) => <Chip key={r} active={rar === r} onClick={() => setRar(r)}>{RLABEL[r]}</Chip>)}
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {list.slice(0, limit).map((e) => (
          <li key={e.id}>
            <button onClick={() => openEquip(e.id)} className="w-full rounded-xl bg-panel p-3 text-left hover:bg-panel-2">
              <div className="flex justify-between gap-2"><span className="font-semibold">{e.name}</span><span className="shrink-0 text-xs text-mute">{RLABEL[e.rarity] ?? e.rarity}</span></div>
              <div className="text-xs text-mute">{e.anyone ? 'Anyone' : e.exclusive ? `Only ${db.chars.get(e.exclusive)?.name ?? 'one card'}` : e.equipConditions.map((g) => g.join(' + ')).join(' or ')}</div>
            </button>
          </li>
        ))}
      </ul>
      {list.length > limit && <button className="mt-4 w-full rounded-xl bg-panel py-3 font-semibold" onClick={() => setLimit(limit + 120)}>Show more</button>}
    </div>
  );
}

export function EquipmentSheet() {
  const { equipSheet, openEquip, db, openChar } = useStore();
  const e = equipSheet !== null ? db.equips.get(equipSheet) : null;
  return (
    <Sheet open={!!e} onClose={() => openEquip(null)} title={e?.name}>
      {e && (
        <>
          <p className="mb-3 text-sm text-mute">{RLABEL[e.rarity] ?? e.rarity}. Can be worn by {e.anyone ? 'anyone' : `${e.eligible.length} character${e.eligible.length === 1 ? '' : 's'}`}{!e.anyone && e.equipConditions.length ? `: ${e.equipConditions.map((g) => g.join(' + ')).join(' or ')}` : ''}.</p>
          {e.slots.map((s, si) => (
            <div key={si} className="mb-2 rounded-xl bg-panel p-3 text-sm">
              <div className="mb-1 text-xs text-mute">Line {si + 1}{s.options.length > 1 ? `, one of ${s.options.length} rolls` : ''}</div>
              {s.options.map((o, oi) => (
                <div key={oi} className={oi ? 'mt-1 border-t border-line pt-1' : ''}>
                  {o.lines.map((l, li) => (
                    <div key={li}>
                      <span className={l.contextual ? 'text-mute' : ''}>{l.raw}</span>
                      {l.cond && <span className="block text-xs text-gi">{conditionText(l, db)}</span>}
                      {l.contextual && <span className="block text-xs text-mute">Not calculated</span>}
                      {l.layer && !l.contextual && <span className="block text-xs text-mute">{l.layer} layer</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
          {!e.anyone && (
            <div className="mt-3 flex flex-wrap gap-2">
              {e.eligible.slice(0, 40).map((id) => { const c = db.chars.get(id); return c ? <button key={id} onClick={() => { openEquip(null); openChar(id); }}><CharAvatar c={c} size={40} /></button> : null; })}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

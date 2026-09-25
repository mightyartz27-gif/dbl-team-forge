import { useEffect, type ReactNode } from 'react';

export function Chip({ active, onClick, children, tone }: { active?: boolean; onClick?: () => void; children: ReactNode; tone?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${active ? 'border-gi bg-gi text-ink' : 'border-line bg-panel text-cream hover:border-mute'}`}
      style={tone && !active ? { borderColor: tone } : undefined}>
      {children}
    </button>
  );
}

export function Button({ children, onClick, kind = 'primary', disabled, full, small }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'quiet'; disabled?: boolean; full?: boolean; small?: boolean }) {
  const k = kind === 'primary' ? 'bg-gi text-ink hover:bg-[#ff9a33] disabled:bg-panel-2 disabled:text-mute'
    : kind === 'ghost' ? 'border border-line bg-panel text-cream hover:border-mute' : 'text-gi hover:underline';
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`${full ? 'w-full' : ''} ${small ? 'px-3 py-1.5 text-sm' : 'px-4 py-3 text-base'} rounded-xl font-bold tracking-wide ${k}`}>
      {children}
    </button>
  );
}

export function Section({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      {title && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-panel p-4 ${className}`}>{children}</div>;
}

/** Horizontal bar used for scores. value 0..100 */
export function Bar({ value, tone = 'var(--color-gi)', label, right }: { value: number; tone?: string; label: string; right?: ReactNode }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-sm"><span className="text-mute">{label}</span><span className="num font-semibold">{right ?? Math.round(value)}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-panel-2">
        <div className="bar-charge h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: tone }} />
      </div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <div className="sheet-enter relative flex max-h-[88vh] w-full max-w-xl flex-col rounded-t-3xl bg-ink shadow-2xl ring-1 ring-line md:rounded-3xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1 font-display text-lg font-bold">{title}</div>
          <button onClick={onClose} className="rounded-full bg-panel px-3 py-1 text-sm font-semibold">Close</button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="scroll-x -mx-4 mb-4 flex gap-1 border-b border-line px-4" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`shrink-0 border-b-2 px-3 pb-2 pt-1 font-display text-base font-bold ${value === t.id ? 'border-gi text-cream' : 'border-transparent text-mute'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const fmtPct = (x: number, digits = 0) => `${x >= 0 ? '+' : ''}${x.toFixed(digits)}%`;
export const fmtDelta = (x: number, unit = '%') => (Math.abs(x) < 0.5 ? '±0' : `${x > 0 ? '+' : ''}${Math.round(x)}${unit}`);

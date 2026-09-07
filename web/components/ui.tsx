import Link from 'next/link';
import type { ReactNode } from 'react';
import { fmtTok, sessionHref, statusClass } from '@/lib/format';
import type { PhaseChip } from '@/lib/queries';

export function Pill({ status, still }: { status: unknown; still?: boolean }) {
  return <span className={`pill ${statusClass(status)}${still ? ' still' : ''}`}>{String(status ?? '—')}</span>;
}

export function Stat({ label, value, sub, live }: { label: string; value: ReactNode; sub?: ReactNode; live?: boolean }) {
  return (
    <div className="stat">
      <div className={`v${live ? ' live' : ''}`}>{value}</div>
      <div className="l">{label}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

export function Panel({ title, note, children }: { title: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {note ? <span className="note">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Bars({ rows, signal }: { rows: Array<{ name: string; value: number; href?: string }>; signal?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty>Nothing yet.</Empty>;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.name}>
          <div className="bar-name" title={r.name}>{r.href ? <Link href={r.href}>{r.name}</Link> : r.name}</div>
          <div className="bar-track"><div className={`bar-fill${signal ? ' signal' : ''}`} style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} /></div>
          <div className="bar-val">{fmtTok(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

export function PhaseStrip({ phases }: { phases: PhaseChip[] | null }) {
  if (!phases?.length) return <span className="chip">no sessions</span>;
  return (
    <div className="strip">
      {phases.map((p) => (
        <Link key={p.session_id} href={sessionHref(p.session_id)} className={statusClass(p.status)}
          title={`${p.phase}${p.lap ? ` lap ${p.lap}` : ''} · ${p.status} · ${p.turns} turns · ${fmtTok(p.tokens_out)} out`}>
          {p.phase}{p.lap ? `·${p.lap}` : ''}
        </Link>
      ))}
    </div>
  );
}

export function Chips({ items, kind }: { items: string[] | null | undefined; kind: 'agent' | 'skill' | 'plain' }) {
  if (!items?.length) return <span className="chip" style={{ opacity: .5 }}>—</span>;
  return (
    <div className="chips">
      {items.map((x) => (
        <span key={x} className={`chip${kind === 'plain' ? '' : ` ${kind}`}`}>{x}</span>
      ))}
    </div>
  );
}

export function DbError({ error }: { error: string }) {
  return (
    <div className="callout bad">
      <div className="h">The board cannot reach its database</div>
      <div className="mono" style={{ fontSize: '.78rem' }}>{error}</div>
      <p style={{ marginTop: '.4rem', color: 'var(--ink-2)' }}>
        Check <code>DATABASE_URL</code> (Supabase → Project Settings → Database → Transaction pooler URI) and that <code>supabase/schema.sql</code> has been applied.
      </p>
    </div>
  );
}

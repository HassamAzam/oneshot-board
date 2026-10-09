import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
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

export function Bars({ rows, signal, fmt = fmtTok }: { rows: Array<{ name: string; value: number; href?: string }>; signal?: boolean; fmt?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty>Nothing yet.</Empty>;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.name}>
          <div className="bar-name" title={r.name}>{r.href ? <Link href={r.href}>{r.name}</Link> : r.name}</div>
          <div className="bar-track"><div className={`bar-fill${signal ? ' signal' : ''}`} style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} /></div>
          <div className="bar-val">{fmt(r.value)}</div>
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

/** A tiny trend line for a stat tile. Pure SVG, server-rendered, no interactivity. */
export function Sparkline({ data, tone = 'accent' }: { data: number[]; tone?: 'accent' | 'signal' }) {
  if (!data?.length) return null;
  const W = 120, H = 26, n = data.length;
  const max = Math.max(...data), min = Math.min(...data), rng = (max - min) || 1;
  const x = (i: number) => (n > 1 ? (W * i) / (n - 1) : 0);
  const y = (v: number) => 24 - 22 * ((v - min) / rng);
  let p = '';
  for (let i = 0; i < n; i++) p += `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(data[i]).toFixed(1)} `;
  const color = tone === 'signal' ? 'var(--signal)' : 'var(--accent)';
  return (
    <svg className="spark" viewBox="0 0 120 26" preserveAspectRatio="none" aria-hidden="true">
      <path d={p} fill="none" style={{ stroke: color }} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function TrendBadge({ dir, pct }: { dir: 'up' | 'down' | 'flat'; pct: number }) {
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '→';
  return <span className={`trend ${dir}`} title="vs previous 24h">{arrow} {Math.abs(pct)}%</span>;
}

/** A conic progress ring with the percentage in the middle (success rate, etc.). */
export function Ring({ pct }: { pct: number }) {
  return <div className="ring" style={{ ['--p' as string]: pct } as CSSProperties}><i>{pct}</i></div>;
}

/**
 * A redesigned stat tile. `right` puts a figure (e.g. a Ring) beside the value;
 * otherwise a trend badge and sparkline can ride under the number.
 */
export function Tile({ label, value, sub, live, lead, tone, trend, spark, right }: {
  label: string; value: ReactNode; sub?: ReactNode; live?: boolean; lead?: boolean;
  tone?: 'ok' | 'signal' | 'live'; trend?: { dir: 'up' | 'down' | 'flat'; pct: number };
  spark?: number[]; right?: ReactNode;
}) {
  const v = <div className={`v${tone ? ` ${tone}` : ''}${live ? ' live' : ''}`}>{value}</div>;
  if (right) {
    return (
      <div className={`tile sm${lead ? ' lead' : ''}`}>
        <div className="tile-flex">
          <div style={{ minWidth: 0 }}>{v}<div className="l">{label}</div>{sub ? <div className="s">{sub}</div> : null}</div>
          {right}
        </div>
      </div>
    );
  }
  return (
    <div className={`tile${lead ? ' lead' : ''}`}>
      {v}
      {trend ? <TrendBadge dir={trend.dir} pct={trend.pct} /> : null}
      <div className="l">{label}</div>
      {sub ? <div className="s">{sub}</div> : null}
      {spark ? <Sparkline data={spark} tone={tone === 'signal' ? 'signal' : 'accent'} /> : null}
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

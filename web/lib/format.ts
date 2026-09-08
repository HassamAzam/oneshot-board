export const n = (v: unknown): number => (v == null ? 0 : Number(v));

export function fmtInt(v: unknown): string {
  return n(v).toLocaleString('en-US');
}

export function fmtTok(v: unknown): string {
  const x = n(v);
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(x >= 10_000_000 ? 0 : 1)}M`;
  if (x >= 1_000) return `${(x / 1_000).toFixed(x >= 100_000 ? 0 : 1)}k`;
  return String(x);
}

export function fmtDur(ms: unknown): string {
  const x = n(ms);
  if (!x) return '—';
  if (x < 1000) return `${Math.round(x)} ms`;
  const s = Math.round(x / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function ago(iso: unknown): string {
  if (!iso) return '—';
  const t = new Date(String(iso)).getTime();
  if (!t) return '—';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fmtTime(iso: unknown): string {
  if (!iso) return '—';
  const d = new Date(String(iso));
  if (!d.getTime()) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function shortModel(m: unknown): string {
  const s = String(m ?? '');
  if (!s) return '—';
  return s.replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

/** Session ids contain slashes; they are routed as catch-all segments. */
export const sessionHref = (id: string) => `/sessions/${id.split('/').map(encodeURIComponent).join('/')}`;

export function statusClass(s: unknown): string {
  switch (String(s ?? '')) {
    case 'ok': case 'done': return 's-ok';
    case 'running': case 'claimed': return 's-live';
    case 'stalled': return 's-warn';
    case 'warned': case 'parked': case 'blocked': return 's-warn';
    case 'failed': case 'error': case 'refused': case 'aborted': return 's-bad';
    default: return 's-muted';
  }
}

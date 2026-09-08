import Link from 'next/link';
import type { Operator } from '@/lib/queries';
import { ago, fmtInt } from '@/lib/format';

/**
 * Whose work to show. Absent means everyone, which is the default on every page —
 * a shared board should open on the whole team, not on you.
 */
export default function OperatorFilter({
  operators, selected, path, extra = {},
}: {
  operators: Operator[];
  selected?: string;
  path: string;
  extra?: Record<string, string | undefined>;
}) {
  if (operators.length < 2 && !selected) return null;
  const href = (id?: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    if (id) p.set('operator', id);
    const qs = p.toString();
    return qs ? `${path}?${qs}` : path;
  };
  const total = operators.reduce((a, o) => a + o.sessions, 0);
  return (
    <div className="filter" role="group" aria-label="Filter by operator">
      <Link href={href()} className={selected ? '' : 'on'} title={`${fmtInt(total)} sessions across everyone`}>
        everyone <span className="cnt">{fmtInt(total)}</span>
      </Link>
      {operators.map((o) => (
        <Link key={o.id} href={href(o.id)} className={selected === o.id ? 'on' : ''}
          title={`${o.user_email ?? o.id}${o.hostname ? ` · ${o.hostname}` : ''} · last seen ${ago(o.last_seen)}`}>
          {o.github_login ?? o.id} <span className="cnt">{fmtInt(o.sessions)}</span>
        </Link>
      ))}
    </div>
  );
}

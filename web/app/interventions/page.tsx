import Link from 'next/link';
import AutoRefresh from '@/components/AutoRefresh';
import OperatorFilter from '@/components/OperatorFilter';
import { DbError, Empty, Panel, Pill } from '@/components/ui';
import { safe } from '@/lib/db';
import { ago, fmtInt, fmtTime } from '@/lib/format';
import { interventionCounts, interventions, operatorsWithCounts } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/** What each gate is guarding, in the words of someone who has to answer it. */
const GATE = {
  plan: { label: 'Plan', asks: 'Is this the right approach, before any code is written?' },
  testcases: { label: 'Test cases', asks: 'Do these cases actually cover the ticket? They are the oracle for verify and QA.' },
  merge: { label: 'Merge', asks: 'A person merges this MR — Oneshot never merges a Review ticket itself.' },
} as const;

const STATE = {
  waiting: { pill: 's-warn', text: 'answer is owed' },
  pending: { pill: 's-muted', text: 'not asked yet' },
  approved: { pill: 's-ok', text: 'answered' },
} as const;

export default async function Interventions({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const operator = (Array.isArray(sp.operator) ? sp.operator[0] : sp.operator) || undefined;
  const showAll = (Array.isArray(sp.all) ? sp.all[0] : sp.all) === '1';

  const { data, error } = await safe(async () => {
    const [rows, counts, operators] = await Promise.all([
      interventions(operator, !showAll), interventionCounts(operator), operatorsWithCounts(),
    ]);
    return { rows, counts, operators };
  });
  if (error || !data) return <DbError error={error ?? 'no data'} />;
  const { rows, counts, operators } = data;
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (operator) p.set('operator', operator);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/interventions?${s}` : '/interventions';
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Interventions</div>
          <h1>What is waiting on a person</h1>
          <p className="sub">
            The three review gates a <code>Review</code> ticket pauses at. These are not failures —
            a run that <em>blocked</em> is a different thing. <b>Answer them in Slack or on the GitLab
            ticket</b>; this page only shows what is outstanding.
          </p>
        </div>
        <AutoRefresh seconds={30} />
      </div>

      <OperatorFilter operators={operators} selected={operator} path="/interventions" extra={showAll ? { all: '1' } : {}} />

      <div className="stats">
        <div className="stat"><div className={`v${Number(counts.waiting) ? ' live' : ''}`}>{fmtInt(counts.waiting)}</div><div className="l">answer owed</div></div>
        <div className="stat"><div className="v">{fmtInt(counts.pending)}</div><div className="l">not asked yet</div></div>
        <div className="stat"><div className="v">{fmtInt(counts.tickets_waiting)}</div><div className="l">tickets affected</div></div>
        <div className="stat"><div className="v">{fmtInt(counts.approved)}</div><div className="l">answered</div></div>
      </div>

      <div className="filter">
        <span className="filter-label">show</span>
        <Link href={qs({})} className={showAll ? '' : 'on'}>outstanding</Link>
        <Link href={qs({ all: '1' })} className={showAll ? 'on' : ''}>everything</Link>
      </div>

      <Panel title={showAll ? 'Every gate' : 'Gates still owed an answer'} note={`${rows.length} row${rows.length === 1 ? '' : 's'}`}>
        {rows.length ? (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Ticket</th><th>Gate</th><th>State</th><th className="num">Rounds</th><th>Where to answer</th><th>Since</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const g = GATE[r.gate as keyof typeof GATE] ?? { label: r.gate, asks: '' };
                  const st = STATE[r.state as keyof typeof STATE] ?? { pill: 's-muted', text: r.state };
                  return (
                    <tr key={r.id}>
                      <td className="title">
                        <Link className="rowlink" href={`/tickets/${r.ticket_iid}`}>#{r.ticket_iid}</Link> {r.title}
                        <span className="sub">{r.run_id}</span>
                      </td>
                      <td><b>{g.label}</b><span className="sub" style={{ whiteSpace: 'normal', maxWidth: '22rem' }}>{g.asks}</span></td>
                      <td><span className={`pill ${st.pill}`}>{st.text}</span></td>
                      <td className="num">{r.rounds || '—'}</td>
                      <td>
                        {r.url ? <a href={r.url} target="_blank" rel="noreferrer">GitLab ticket ↗</a> : '—'}
                        <span className="sub">or the run’s Slack thread</span>
                      </td>
                      <td className="dim">{r.requested_at ? `${fmtTime(r.requested_at)} (${ago(r.requested_at)})` : ago(r.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            {showAll
              ? 'No review gates recorded. They only appear on tickets carrying the `Review` label, or touching a guarded path.'
              : 'Nothing is waiting on a person right now.'}
          </Empty>
        )}
      </Panel>

      {rows.some((r) => (r.feedback ?? []).length) ? (
        <Panel title="Feedback given so far" note="oldest first, per gate">
          <div className="panel-body">
            {rows.filter((r) => (r.feedback ?? []).length).map((r) => (
              <details className="raw" key={r.id} open>
                <summary>#{r.ticket_iid} · {GATE[r.gate as keyof typeof GATE]?.label ?? r.gate} · {(r.feedback ?? []).length} round(s)</summary>
                <pre>{(r.feedback ?? []).map((f, i) => `${i + 1}. ${f}`).join('\n\n')}</pre>
              </details>
            ))}
          </div>
        </Panel>
      ) : null}
    </>
  );
}

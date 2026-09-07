import Link from 'next/link';
import AutoRefresh from '@/components/AutoRefresh';
import { Chips, DbError, Empty, Panel, Pill } from '@/components/ui';
import { safe } from '@/lib/db';
import { ago, fmtDur, fmtTime, fmtTok, sessionHref, shortModel } from '@/lib/format';
import { sessionsForRun, ticketRuns } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function Ticket({ params }: { params: Promise<{ iid: string }> }) {
  const { iid: raw } = await params;
  const iid = Number(raw);
  const { data, error } = await safe(async () => {
    const runs = await ticketRuns(iid);
    const sessions = await Promise.all(runs.map((r) => sessionsForRun(r.run_id)));
    return { runs, sessions };
  });
  if (error || !data) return <DbError error={error ?? 'no data'} />;
  const { runs, sessions } = data;
  if (!runs.length) return <div className="callout warn"><div className="h">No run recorded for #{iid}</div>The collector has not seen a journal for this ticket.</div>;
  const latest = runs[0];

  return (
    <>
      <div className="crumbs"><Link href="/tickets">tickets</Link> / #{iid}</div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Ticket #{iid}</div>
          <h1>{latest.title ?? `Ticket #${iid}`}</h1>
          <p className="sub">
            {runs.length} run{runs.length === 1 ? '' : 's'}
            {latest.url ? <> · <a href={latest.url} target="_blank" rel="noreferrer">open in GitLab ↗</a></> : null}
          </p>
        </div>
        <AutoRefresh seconds={30} />
      </div>

      {runs.map((r, i) => {
        const ss = sessions[i];
        const tokOut = ss.reduce((a, s) => a + Number(s.tokens_out), 0);
        const weighted = ss.reduce((a, s) => a + Number(s.weighted ?? 0), 0);
        const agentSet = [...new Set(ss.flatMap((s) => s.agent_types ?? []))];
        const skillSet = [...new Set(ss.flatMap((s) => s.skill_names ?? []))];
        return (
          <Panel key={r.run_id}
            title={<><Pill status={r.status} /> <span className="mono" style={{ fontSize: '.78rem', marginLeft: '.4rem' }}>{r.run_id}</span>{r.archived ? <span className="chip" style={{ marginLeft: '.4rem' }}>archived</span> : null}</>}
            note={`started ${fmtTime(r.started_at)} (${ago(r.started_at)})${r.ended_at ? ` · ended ${fmtTime(r.ended_at)}` : ''}`}>
            <div className="panel-body" style={{ borderBottom: '1px solid var(--rule)' }}>
              <div className="grid cols-3">
                <dl className="kv">
                  <dt>branch</dt><dd className="mono">{r.branch ?? '—'}</dd>
                  <dt>MR</dt><dd>{r.mr_iid ? `!${r.mr_iid}` : '—'}</dd>
                  <dt>merged</dt><dd className="mono">{r.merged_sha ? r.merged_sha.slice(0, 10) : '—'}</dd>
                  <dt>deployed</dt><dd className="mono">{r.deployed_sha ? r.deployed_sha.slice(0, 10) : '—'}</dd>
                </dl>
                <dl className="kv">
                  <dt>operator</dt><dd>{r.github_login ?? r.user_email ?? r.operator_id ?? '—'}<span className="mono" style={{ display: 'block', color: 'var(--ink-3)', fontSize: '.72rem' }}>{r.hostname}</span></dd>
                  <dt>sessions</dt><dd>{ss.length}</dd>
                  <dt>output</dt><dd>{fmtTok(tokOut)} tokens · {fmtTok(weighted)} weighted</dd>
                </dl>
                <dl className="kv">
                  <dt>agents</dt><dd><Chips items={agentSet} kind="agent" /></dd>
                  <dt>skills</dt><dd><Chips items={skillSet} kind="skill" /></dd>
                </dl>
              </div>
              {r.blocked_why ? <div className="callout bad" style={{ marginTop: '.9rem', marginBottom: 0 }}><div className="h">Blocked</div><span className="mono" style={{ fontSize: '.78rem' }}>{r.blocked_why}</span></div> : null}
            </div>
            {ss.length ? (
              <div className="scroll">
                <table className="tbl">
                  <thead><tr><th>Phase</th><th>Status</th><th>Model</th><th className="num">Turns</th><th className="num">Out</th><th className="num">In</th><th className="num">Cache</th><th className="num">Duration</th><th>Agents</th><th>Skills</th><th className="num">Tools</th><th>Started</th></tr></thead>
                  <tbody>
                    {ss.map((s) => (
                      <tr key={s.session_id}>
                        <td><Link className="rowlink" href={sessionHref(s.session_id)}>{s.phase}</Link>{s.lap ? <span className="sub">lap {s.lap}</span> : null}</td>
                        <td><Pill status={s.status} /></td>
                        <td className="mono">{shortModel(s.model)}</td>
                        <td className="num">{s.turns}</td>
                        <td className="num">{fmtTok(s.tokens_out)}</td>
                        <td className="num">{fmtTok(s.tokens_in)}</td>
                        <td className="num">{fmtTok(s.cache_read)}</td>
                        <td className="num">{fmtDur(s.duration_ms)}</td>
                        <td><Chips items={s.agent_types} kind="agent" /></td>
                        <td><Chips items={s.skill_names} kind="skill" /></td>
                        <td className="num">{s.n_tools}</td>
                        <td className="dim">{fmtTime(s.started_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty>No sessions recorded for this run.</Empty>}
          </Panel>
        );
      })}
    </>
  );
}

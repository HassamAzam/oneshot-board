import Link from 'next/link';
import AutoRefresh from '@/components/AutoRefresh';
import { Bars, DbError, Empty, Panel, PhaseStrip, Pill, Stat } from '@/components/ui';
import { safe } from '@/lib/db';
import { ago, fmtInt, fmtTok, sessionHref, shortModel } from '@/lib/format';
import { agentSummary, fleetStats, recentRuns, runningSessions, skillSummary } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function Fleet() {
  const { data, error } = await safe(async () => {
    const [stats, running, runs, agents, skills] = await Promise.all([
      fleetStats(), runningSessions(), recentRuns(30), agentSummary(), skillSummary(),
    ]);
    return { stats, running, runs, agents, skills };
  });
  if (error || !data) return <DbError error={error ?? 'no data'} />;
  const { stats, running, runs, agents, skills } = data;
  const lastSeen = stats.last_seen as string | null;
  const collectorStale = !lastSeen || Date.now() - new Date(lastSeen).getTime() > 3 * 60_000;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Fleet</div>
          <h1>What is running, and what ran</h1>
          <p className="sub">
            Collector last checked in <b>{ago(lastSeen)}</b>
            {collectorStale ? <span className="err-text"> — stale; is <code>npm run collector</code> up?</span> : null}
          </p>
        </div>
        <AutoRefresh seconds={30} />
      </div>

      <div className="stats">
        <Stat label="running now" value={fmtInt(stats.running)} live={Number(stats.running) > 0} />
        <Stat label="sessions" value={fmtInt(stats.sessions)} sub={`${fmtInt(stats.runs)} runs · ${fmtInt(stats.tickets)} tickets`} />
        <Stat label="agent calls" value={fmtInt(stats.agent_calls)} />
        <Stat label="skill calls" value={fmtInt(stats.skill_calls)} />
        <Stat label="tool calls" value={fmtInt(stats.tool_calls)} />
        <Stat label="output tokens · 24h" value={fmtTok(stats.tokens_out_24h)} sub={`${fmtTok(stats.tokens_out_total)} all time`} />
        <Stat label="weighted · all time" value={fmtTok(stats.weighted_total)} sub="subscription unit" />
      </div>

      <Panel title="Running now" note={running.length ? `${running.length} session${running.length === 1 ? '' : 's'}` : undefined}>
            {running.length ? (
              <div className="scroll">
                <table className="tbl">
                  <thead><tr><th>Ticket</th><th>Phase</th><th>Model</th><th className="num">Turns</th><th className="num">Out</th><th>Started</th></tr></thead>
                  <tbody>
                    {running.map((s) => (
                      <tr key={s.session_id}>
                        <td><Link className="rowlink" href={`/tickets/${s.ticket_iid}`}>#{s.ticket_iid}</Link><span className="sub">{s.title}</span></td>
                        <td><Link href={sessionHref(s.session_id)}><Pill status="running" /> {s.phase}{s.lap ? ` · lap ${s.lap}` : ''}</Link></td>
                        <td className="mono">{shortModel(s.model)}</td>
                        <td className="num">{s.turns}</td>
                        <td className="num">{fmtTok(s.tokens_out)}</td>
                        <td className="dim">{ago(s.started_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty>Nothing running. Sessions appear here within seconds of a phase spawning.</Empty>}
          </Panel>

          <Panel title="Recent runs" note="newest first">
            {runs.length ? (
              <div className="scroll">
                <table className="tbl">
                  <thead><tr><th>Ticket</th><th>Status</th><th className="phases">Phases</th><th className="num">Sessions</th><th className="num">Out</th><th className="num">Weighted</th><th>Started</th></tr></thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.run_id}>
                        <td><span className="t" title={r.title ?? undefined}><Link className="rowlink" href={`/tickets/${r.ticket_iid}`}>#{r.ticket_iid}</Link> {r.title}</span><span className="sub">{r.run_id}{r.archived ? ' · archived' : ''}</span></td>
                        <td><Pill status={r.status} /></td>
                        <td className="phases"><PhaseStrip phases={r.phases} /></td>
                        <td className="num">{r.n_sessions}</td>
                        <td className="num">{fmtTok(r.tokens_out)}</td>
                        <td className="num">{fmtTok(r.weighted)}</td>
                        <td className="dim">{ago(r.started_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty>No runs yet. Start the collector and they will appear on the next flush.</Empty>}
          </Panel>

      <div className="grid cols-2">
          <Panel title="Agents by output tokens" note={<Link href="/agents">all agents →</Link>}>
            <div className="panel-body">
              <Bars rows={agents.slice(0, 10).map((a) => ({ name: a.subagent_type, value: Number(a.tokens_out), href: `/agents?agent=${encodeURIComponent(a.subagent_type)}` }))} />
            </div>
          </Panel>
          <Panel title="Skills by calls" note={<Link href="/skills">all skills →</Link>}>
            <div className="panel-body">
              <Bars signal rows={skills.slice(0, 10).map((k) => ({ name: k.skill_name, value: Number(k.calls), href: `/skills?skill=${encodeURIComponent(k.skill_name)}` }))} />
            </div>
          </Panel>
      </div>
    </>
  );
}

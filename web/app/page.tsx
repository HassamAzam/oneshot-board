import Link from 'next/link';
import AutoRefresh from '@/components/AutoRefresh';
import { Bars, DbError, Empty, Panel, PhaseStrip, Pill, Stat } from '@/components/ui';
import { safe } from '@/lib/db';
import { ago, fmtInt, fmtTok, sessionHref, shortModel } from '@/lib/format';
import { agentSummary, fleetStats, operatorsWithCounts, recentRuns, runningSessions, skillSummary } from '@/lib/queries';
import OperatorFilter from '@/components/OperatorFilter';

export const dynamic = 'force-dynamic';

export default async function Fleet({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const operator = (Array.isArray(sp.operator) ? sp.operator[0] : sp.operator) || undefined;
  const { data, error } = await safe(async () => {
    const [stats, running, runs, agents, skills, operators] = await Promise.all([
      fleetStats(operator), runningSessions(operator), recentRuns(30, operator),
      agentSummary(operator), skillSummary(operator), operatorsWithCounts(),
    ]);
    return { stats, running, runs, agents, skills, operators };
  });
  if (error || !data) return <DbError error={error ?? 'no data'} />;
  const { stats, running, runs, agents, skills, operators } = data;
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

      <OperatorFilter operators={operators} selected={operator} path="/" />

      <div className="stats">
        <Stat label="running now" value={fmtInt(stats.running)} live={Number(stats.running) > 0}
          sub={Number(stats.stalled) ? `${fmtInt(stats.stalled)} quiet for >15m` : undefined} />
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
                  <thead><tr><th>Ticket</th><th>Phase</th><th>Model</th><th className="num">Turns</th><th className="num">Out</th><th>Started</th><th>Last wrote</th></tr></thead>
                  <tbody>
                    {running.map((s) => (
                      <tr key={s.session_id}>
                        <td><Link className="rowlink" href={`/tickets/${s.ticket_iid}`}>#{s.ticket_iid}</Link><span className="sub">{s.title}</span></td>
                        <td><Link href={sessionHref(s.session_id)}><Pill status={s.status} /> {s.phase}{s.lap ? ` · lap ${s.lap}` : ''}</Link></td>
                        <td className="mono">{shortModel(s.model)}</td>
                        <td className="num">{s.turns}</td>
                        <td className="num">{fmtTok(s.tokens_out)}</td>
                        <td className="dim">{ago(s.started_at)}</td>
                        <td className={s.status === 'stalled' ? 'err-text' : 'dim'}>{ago(s.last_activity_at)}</td>
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
                  <thead><tr><th>Ticket</th><th>Status</th><th className="phases">Phases</th><th className="num">Sessions</th><th className="num">Out</th><th className="num">Weighted</th><th>Who</th><th>Started</th></tr></thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.run_id}>
                        <td><span className="t" title={r.title ?? undefined}><Link className="rowlink" href={`/tickets/${r.ticket_iid}`}>#{r.ticket_iid}</Link> {r.title}</span><span className="sub">{r.run_id}{r.archived ? ' · archived' : ''}</span></td>
                        <td><Pill status={r.status} /></td>
                        <td className="phases"><PhaseStrip phases={r.phases} /></td>
                        <td className="num">{r.n_sessions}</td>
                        <td className="num">{fmtTok(r.tokens_out)}</td>
                        <td className="num">{fmtTok(r.weighted)}</td>
                        <td className="who">{r.operator_id ?? '—'}</td>
                        <td className="dim">{ago(r.started_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty>No runs yet. Start the collector and they will appear on the next flush.</Empty>}
          </Panel>

      <div className="grid cols-2">
          <Panel title="Agents by output tokens" note={<Link href={operator ? `/agents?operator=${encodeURIComponent(operator)}` : "/agents"}>all agents →</Link>}>
            <div className="panel-body">
              <Bars rows={agents.slice(0, 10).map((a) => ({ name: a.subagent_type, value: Number(a.tokens_out), href: `/agents?agent=${encodeURIComponent(a.subagent_type)}${operator ? `&operator=${encodeURIComponent(operator)}` : ''}` }))} />
            </div>
          </Panel>
          <Panel title="Skills by calls" note={<Link href={operator ? `/skills?operator=${encodeURIComponent(operator)}` : "/skills"}>all skills →</Link>}>
            <div className="panel-body">
              <Bars signal rows={skills.slice(0, 10).map((k) => ({ name: k.skill_name, value: Number(k.calls), href: `/skills?skill=${encodeURIComponent(k.skill_name)}${operator ? `&operator=${encodeURIComponent(operator)}` : ''}` }))} />
            </div>
          </Panel>
      </div>
    </>
  );
}

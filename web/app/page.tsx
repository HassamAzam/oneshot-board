import Link from 'next/link';
import AutoRefresh from '@/components/AutoRefresh';
import ActivityChart from '@/components/ActivityChart';
import { Bars, DbError, Empty, Panel, PhaseStrip, Pill, Ring, Tile } from '@/components/ui';
import { safe } from '@/lib/db';
import { ago, fmtHours, fmtInt, fmtTok, pct, sessionHref, shortModel } from '@/lib/format';
import {
  activityByDay, agentsByTime, fleetStats, operatorsWithCounts,
  recentRuns, runningSessions, skillsByCompute,
} from '@/lib/queries';
import OperatorFilter from '@/components/OperatorFilter';

export const dynamic = 'force-dynamic';

export default async function Fleet({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const operator = (Array.isArray(sp.operator) ? sp.operator[0] : sp.operator) || undefined;
  const { data, error } = await safe(async () => {
    const [stats, running, runs, agents, skills, operators, activity] = await Promise.all([
      fleetStats(operator), runningSessions(operator), recentRuns(30, operator),
      agentsByTime(operator, 10), skillsByCompute(operator, 10), operatorsWithCounts(),
      activityByDay(14, operator),
    ]);
    return { stats, running, runs, agents, skills, operators, activity };
  });
  if (error || !data) return <DbError error={error ?? 'no data'} />;
  const { stats, running, runs, agents, skills, operators, activity } = data;

  const lastSeen = stats.last_seen as string | null;
  const collectorStale = !lastSeen || Date.now() - new Date(lastSeen).getTime() > 3 * 60_000;

  // Derived figures the tiles read from.
  const successRate = pct(stats.sessions_ok, Number(stats.sessions_ok) + Number(stats.sessions_bad));
  const reworkRate = pct(stats.sessions_rework, stats.sessions);
  const toolErrRate = pct(stats.tool_errors, stats.tool_calls);
  const cur24 = Number(stats.tokens_out_24h), prev24 = Number(stats.tokens_out_prev_24h);
  const delta = prev24 ? Math.round(((cur24 - prev24) / prev24) * 100) : (cur24 ? 100 : 0);
  const tokTrend = { dir: delta > 0 ? 'up' as const : delta < 0 ? 'down' as const : 'flat' as const, pct: delta };

  // Daily series for the sparklines.
  const sparkTokens = activity.map((d) => Number(d.tokens_out));
  const sparkSessions = activity.map((d) => d.sessions);
  const sparkCompute = activity.map((d) => Number(d.compute_ms));

  return (
    <>
      {/* ---- hero: fleet health + activity ---- */}
      <section className="hero">
        <div className="hero-card hero-main">
          <div>
            <div className="eyebrow">Fleet</div>
            <h1 className="hero-title">What is running, and what ran</h1>
          </div>
          <div className="health-row">
            <div className="health-item">
              <div className="n live">{Number(stats.running) > 0 ? <span className="ldot" aria-hidden="true" /> : null}{fmtInt(stats.running)}</div>
              <div className="cap">running now</div>
            </div>
            <div className="health-item">
              <div className="n" style={{ color: Number(stats.stalled) ? 'var(--warn)' : undefined }}>{fmtInt(stats.stalled)}</div>
              <div className="cap">stalled &gt;15m</div>
            </div>
            <div className="health-item">
              <div className="n">{fmtInt(stats.desks_reporting)}<small>/{fmtInt(stats.operators)}</small></div>
              <div className="cap">desks reporting</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.7rem' }}>
              <span className={`heartbeat ${collectorStale ? 'stale' : 'fresh'}`}>
                <span className="b" aria-hidden="true" /> collector · {ago(lastSeen)}
              </span>
              <AutoRefresh seconds={30} />
            </div>
          </div>
        </div>
        <div className="hero-card">
          <ActivityChart data={activity} />
        </div>
      </section>

      <OperatorFilter operators={operators} selected={operator} path="/" />

      {/* ---- primary tiles ---- */}
      <div className="tiles">
        <Tile lead label="compute time · total"
          value={<>{fmtHours(stats.compute_ms_total).replace(/h$/, '')}<small>h</small></>}
          sub={`${fmtHours(stats.compute_ms_24h)} in last 24h`} spark={sparkCompute} />
        <Tile label="output tokens · 24h" value={fmtTok(stats.tokens_out_24h)}
          sub={`${fmtTok(stats.tokens_out_total)} all time`} trend={tokTrend} spark={sparkTokens} />
        <Tile label="weighted · all time" value={fmtTok(stats.weighted_total)} sub="subscription unit" />
        <Tile label="sessions" value={fmtInt(stats.sessions)}
          sub={`${fmtInt(stats.runs)} runs · ${fmtInt(stats.tickets)} tickets`} spark={sparkSessions} />
      </div>

      {/* ---- secondary tiles ---- */}
      <div className="tiles sec">
        <Tile label="success rate" tone="ok" value={`${successRate}%`} sub="ok vs failed/refused"
          right={<Ring pct={successRate} />} />
        <Tile label="tickets shipped" value={fmtInt(stats.tickets_shipped)} sub={`of ${fmtInt(stats.tickets)} · passed all phases`} />
        <Tile label="rework rate" tone="signal" value={`${reworkRate}%`} sub="sessions on lap > 0" />
        <Tile label="agent · skill calls" value={`${fmtInt(stats.agent_calls)} · ${fmtInt(stats.skill_calls)}`} sub="spawned / invoked" />
        <Tile label="tool calls" value={fmtTok(stats.tool_calls)} sub={`${toolErrRate}% errored`} />
      </div>

      <Panel title="Running now" note={running.length ? `${running.length} session${running.length === 1 ? '' : 's'}` : undefined}>
        {running.length ? (
          <div className="scroll cap">
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
          <div className="scroll cap">
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
        <Panel title="Agents by compute time" note={<Link href={operator ? `/agents?operator=${encodeURIComponent(operator)}` : '/agents'}>all agents →</Link>}>
          <div className="panel-body">
            <Bars fmt={fmtHours} rows={agents.map((a) => ({ name: a.subagent_type, value: Number(a.ms), href: `/agents?agent=${encodeURIComponent(a.subagent_type)}${operator ? `&operator=${encodeURIComponent(operator)}` : ''}` }))} />
          </div>
        </Panel>
        <Panel title="Skills by time" note={<Link href={operator ? `/skills?operator=${encodeURIComponent(operator)}` : '/skills'} title="Skill calls have no duration; this attributes each session's compute to every skill in it, once per session.">attributed · all skills →</Link>}>
          <div className="panel-body">
            <Bars signal fmt={fmtHours} rows={skills.map((k) => ({ name: k.skill_name, value: Number(k.ms), href: `/skills?skill=${encodeURIComponent(k.skill_name)}${operator ? `&operator=${encodeURIComponent(operator)}` : ''}` }))} />
          </div>
        </Panel>
      </div>
    </>
  );
}

import Link from 'next/link';
import { Bars, DbError, Empty, Panel, Pill } from '@/components/ui';
import { safe } from '@/lib/db';
import { ago, fmtDur, fmtInt, fmtTok, sessionHref } from '@/lib/format';
import { agentCalls, agentSummary, operatorsWithCounts } from '@/lib/queries';
import OperatorFilter from '@/components/OperatorFilter';

export const dynamic = 'force-dynamic';

export default async function Agents({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const agent = (Array.isArray(sp.agent) ? sp.agent[0] : sp.agent) || undefined;
  const operator = (Array.isArray(sp.operator) ? sp.operator[0] : sp.operator) || undefined;
  const { data, error } = await safe(async () => {
    const [summary, calls, operators] = await Promise.all([
      agentSummary(operator), agentCalls(agent, 80, operator), operatorsWithCounts(),
    ]);
    return { summary, calls, operators };
  });
  if (error || !data) return <DbError error={error ?? 'no data'} />;
  const { summary, calls, operators } = data;
  const total = summary.reduce((a, r) => a + Number(r.calls), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Agents</div>
          <h1>Which agents ran, and what they cost</h1>
          <p className="sub">{fmtInt(total)} calls across {summary.length} agent types. Names come from the transcript, so your own agents show as themselves — never as “custom”.</p>
        </div>
      </div>

      <OperatorFilter operators={operators} selected={operator} path="/agents" extra={{ agent }} />

      <div className="grid main-side">
        <Panel title="By agent" note="sorted by output tokens">
          {summary.length ? (
            <div className="scroll">
              <table className="tbl">
                <thead><tr><th>Agent</th><th className="num">Calls</th><th className="num">OK</th><th className="num">Failed</th><th className="num">Sessions</th><th className="num">Turns</th><th className="num">Tools</th><th className="num">Out</th><th className="num">Cache read</th><th className="num">Avg time</th><th>Last</th></tr></thead>
                <tbody>
                  {summary.map((a) => (
                    <tr key={a.subagent_type}>
                      <td><Link className="rowlink" href={`/agents?agent=${encodeURIComponent(a.subagent_type)}${operator ? `&operator=${encodeURIComponent(operator)}` : ''}`}><span className="chip agent">{a.subagent_type}</span></Link></td>
                      <td className="num">{a.calls}</td>
                      <td className="num">{a.ok}</td>
                      <td className="num">{Number(a.failed) ? <span className="err-text">{a.failed}</span> : 0}</td>
                      <td className="num">{a.sessions}</td>
                      <td className="num">{fmtInt(a.turns)}</td>
                      <td className="num">{fmtInt(a.tool_calls)}</td>
                      <td className="num">{fmtTok(a.tokens_out)}</td>
                      <td className="num">{fmtTok(a.cache_read)}</td>
                      <td className="num">{fmtDur(a.avg_ms)}</td>
                      <td className="dim">{ago(a.last_used)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No agent calls recorded yet.</Empty>}
        </Panel>
        <Panel title="Output tokens">
          <div className="panel-body"><Bars rows={summary.map((a) => ({ name: a.subagent_type, value: Number(a.tokens_out) }))} /></div>
        </Panel>
      </div>

      <Panel title={agent ? <>Recent calls · <span className="chip agent">{agent}</span> <Link href={operator ? `/agents?operator=${encodeURIComponent(operator)}` : "/agents"} style={{ marginLeft: '.5rem', fontSize: '.74rem' }}>clear</Link></> : 'Recent calls'} note="newest first">
        {calls.length ? (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Agent</th><th>Task</th><th>Where</th><th>Status</th><th className="num">Turns</th><th className="num">Tools</th><th className="num">Out</th><th className="num">Took</th></tr></thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.tool_use_id}>
                    <td><span className="chip agent">{c.subagent_type}</span></td>
                    <td className="wrap">{c.description ?? '—'}</td>
                    <td><Link href={`${sessionHref(c.session_id)}?tab=agents`}>#{c.ticket_iid} · {c.phase}{c.lap ? ` lap ${c.lap}` : ''}</Link></td>
                    <td><Pill status={c.status} /></td>
                    <td className="num">{c.turns}</td>
                    <td className="num">{c.tool_calls}</td>
                    <td className="num">{fmtTok(c.tokens_out)}</td>
                    <td className="num dim">{fmtDur(c.duration_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No calls match.</Empty>}
      </Panel>
    </>
  );
}

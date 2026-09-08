import Link from 'next/link';
import { Bars, Chips, DbError, Empty, Panel } from '@/components/ui';
import { safe } from '@/lib/db';
import { ago, fmtDur, fmtInt, fmtTime, sessionHref } from '@/lib/format';
import { operatorsWithCounts, skillCalls, skillSummary, toolSummary } from '@/lib/queries';
import OperatorFilter from '@/components/OperatorFilter';

export const dynamic = 'force-dynamic';

export default async function Skills({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const skill = (Array.isArray(sp.skill) ? sp.skill[0] : sp.skill) || undefined;
  const operator = (Array.isArray(sp.operator) ? sp.operator[0] : sp.operator) || undefined;
  const { data, error } = await safe(async () => {
    const [summary, calls, tools, operators] = await Promise.all([
      skillSummary(operator), skillCalls(skill, 80, operator), toolSummary(operator), operatorsWithCounts(),
    ]);
    return { summary, calls, tools, operators };
  });
  if (error || !data) return <DbError error={error ?? 'no data'} />;
  const { summary, calls, tools, operators } = data;
  const total = summary.reduce((a, r) => a + Number(r.calls), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Skills &amp; tools</div>
          <h1>Which skills were loaded, by whom, in which phase</h1>
          <p className="sub">{fmtInt(total)} skill invocations across {summary.length} skills.</p>
        </div>
      </div>

      <OperatorFilter operators={operators} selected={operator} path="/skills" extra={{ skill }} />

      <div className="grid main-side">
        <Panel title="By skill" note="most invoked first">
          {summary.length ? (
            <div className="scroll">
              <table className="tbl">
                <thead><tr><th>Skill</th><th className="num">Calls</th><th className="num">Sessions</th><th className="num">Failed</th><th>Invoked by agents</th><th>Phases</th><th>Last</th></tr></thead>
                <tbody>
                  {summary.map((k) => (
                    <tr key={k.skill_name}>
                      <td><Link className="rowlink" href={`/skills?skill=${encodeURIComponent(k.skill_name)}${operator ? `&operator=${encodeURIComponent(operator)}` : ''}`}><span className="chip skill">{k.skill_name}</span></Link></td>
                      <td className="num">{k.calls}</td>
                      <td className="num">{k.sessions}</td>
                      <td className="num">{Number(k.failures) ? <span className="err-text">{k.failures}</span> : 0}</td>
                      <td><Chips items={k.agents as string[]} kind="agent" /></td>
                      <td><Chips items={k.phases as string[]} kind="plain" /></td>
                      <td className="dim">{ago(k.last_used)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No skill calls recorded yet.</Empty>}
        </Panel>
        <Panel title="Calls">
          <div className="panel-body"><Bars signal rows={summary.map((k) => ({ name: k.skill_name, value: Number(k.calls) }))} /></div>
        </Panel>
      </div>

      <Panel title={skill ? <>Recent invocations · <span className="chip skill">{skill}</span> <Link href={operator ? `/skills?operator=${encodeURIComponent(operator)}` : "/skills"} style={{ marginLeft: '.5rem', fontSize: '.74rem' }}>clear</Link></> : 'Recent invocations'} note="newest first">
        {calls.length ? (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Skill</th><th>Where</th><th>Invoked from</th><th>Args</th><th>Loaded</th><th>When</th></tr></thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.tool_use_id}>
                    <td><span className="chip skill">{c.skill_name}</span></td>
                    <td><Link href={`${sessionHref(c.session_id)}?tab=skills`}>#{c.ticket_iid} · {c.phase}{c.lap ? ` lap ${c.lap}` : ''}</Link></td>
                    <td>{c.inside_agent ? <span className="chip agent">{c.inside_agent}</span> : <span className="dim">main</span>}</td>
                    <td className="mono wrap" style={{ fontSize: '.74rem' }}>{c.args ?? '—'}</td>
                    <td>{c.ok == null ? <span className="pill s-muted">?</span> : c.ok ? <span className="pill s-ok">ok</span> : <span className="pill s-bad">failed</span>}</td>
                    <td className="dim">{c.invoked_at ? fmtTime(c.invoked_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No invocations match.</Empty>}
      </Panel>

      <Panel title="Tools" note="every tool, across every session">
        {tools.length ? (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Tool</th><th className="num">Calls</th><th className="num">Errors</th><th className="num">Inside agents</th><th className="num">Avg time</th></tr></thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.tool_name}>
                    <td className="mono">{t.tool_name}</td>
                    <td className="num">{fmtInt(t.calls)}</td>
                    <td className="num">{Number(t.errors) ? <span className="err-text">{fmtInt(t.errors)}</span> : 0}</td>
                    <td className="num">{fmtInt(t.inside_agents)}</td>
                    <td className="num dim">{fmtDur(t.avg_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No tool calls recorded yet.</Empty>}
      </Panel>
    </>
  );
}

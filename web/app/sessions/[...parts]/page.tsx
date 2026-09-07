import Link from 'next/link';
import AutoRefresh from '@/components/AutoRefresh';
import { Chips, DbError, Empty, Panel, Pill } from '@/components/ui';
import { safe } from '@/lib/db';
import { ago, fmtDur, fmtInt, fmtTime, fmtTok, sessionHref, shortModel } from '@/lib/format';
import { agentsForSession, linesForSession, sessionById, skillsForSession, toolsForSession, type Line } from '@/lib/queries';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

function textOf(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((b) => (typeof b === 'string' ? b : (b as { type?: string; text?: string })?.type === 'text' ? (b as { text?: string }).text ?? '' : JSON.stringify(b))).join('\n');
  return JSON.stringify(v);
}

function LineBody({ line }: { line: Line }) {
  const d = line.body as Record<string, unknown>;
  const msg = d.message as { content?: unknown; usage?: Record<string, number> } | undefined;
  const content = Array.isArray(msg?.content) ? (msg?.content as Array<Record<string, unknown>>) : null;
  const raw = <details className="raw"><summary>raw json</summary><pre>{JSON.stringify(d, null, 2).slice(0, 60_000)}</pre></details>;

  if (line.kind === 'system' && line.subtype === 'init') {
    return <div className="tl-body"><div className="tl-tool">session started · <b>{String(d.model ?? '')}</b> · cwd <code>{String(d.cwd ?? '')}</code> · {Array.isArray(d.tools) ? d.tools.length : 0} tools</div>{raw}</div>;
  }
  if (line.kind === 'result') {
    return (
      <div className="tl-body">
        <div className="tl-tool"><b>{String(d.subtype ?? 'result')}</b> · {String(d.num_turns ?? '?')} turns · {fmtDur(d.duration_ms)}</div>
        {d.result ? <div className="tl-out"><pre>{textOf(d.result).slice(0, 8000)}</pre></div> : null}
        {raw}
      </div>
    );
  }
  if (line.kind === 'cli-stderr') {
    return <div className="tl-body"><div className="tl-out"><pre className="err-text">{String(d.text ?? '')}</pre></div></div>;
  }
  if (content) {
    return (
      <div className="tl-body">
        {content.map((b, i) => {
          const t = b.type as string;
          if (t === 'text') return <div className="tl-text" key={i}>{String(b.text ?? '')}</div>;
          if (t === 'thinking' || t === 'redacted_thinking') return <div className="tl-text" key={i} style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>[thinking{b.thinking ? `] ${String(b.thinking).slice(0, 1500)}` : ']'}</div>;
          if (t === 'tool_use') {
            const input = (b.input ?? {}) as Record<string, unknown>;
            const name = String(b.name);
            const head = name === 'Task' ? `${input.subagent_type ?? ''} — ${input.description ?? ''}`
              : name === 'Skill' ? String(input.skill ?? input.command ?? '')
              : name === 'Bash' ? String(input.command ?? '')
              : typeof input.file_path === 'string' ? input.file_path
              : typeof input.pattern === 'string' ? input.pattern
              : Object.keys(input).slice(0, 3).join(', ');
            return (
              <div key={i}>
                <div className="tl-tool">→ <b>{name}</b> <Link href={`/tools/${encodeURIComponent(String(b.id))}`} className="mono">{String(head).slice(0, 200)}</Link></div>
                <details className="raw"><summary>input</summary><pre>{JSON.stringify(input, null, 2).slice(0, 20_000)}</pre></details>
              </div>
            );
          }
          if (t === 'tool_result') {
            const out = textOf(b.content);
            return (
              <div key={i}>
                <div className="tl-tool">← result{b.is_error ? <span className="err-text"> · error</span> : null} <Link href={`/tools/${encodeURIComponent(String(b.tool_use_id))}`} className="mono">{String(b.tool_use_id).slice(0, 16)}…</Link></div>
                <div className="tl-out"><pre className={b.is_error ? 'err-text' : undefined}>{out.slice(0, 4000)}{out.length > 4000 ? `\n…[${fmtInt(out.length - 4000)} more chars — open the tool call]` : ''}</pre></div>
              </div>
            );
          }
          return <div className="tl-tool" key={i}>[{t}]</div>;
        })}
        {raw}
      </div>
    );
  }
  if (typeof msg?.content === 'string') return <div className="tl-body"><div className="tl-text">{msg.content}</div>{raw}</div>;
  return <div className="tl-body">{raw}</div>;
}

export default async function SessionPage({ params, searchParams }: { params: Promise<{ parts: string[] }>; searchParams: Promise<Search> }) {
  const { parts } = await params;
  const sp = await searchParams;
  const id = parts.map(decodeURIComponent).join('/');
  const tab = one(sp.tab) || 'activity';
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const { data, error } = await safe(async () => {
    const s = await sessionById(id);
    if (!s) return null;
    const [agents, skills, tools, lines] = await Promise.all([
      agentsForSession(id), skillsForSession(id), toolsForSession(id),
      tab === 'transcript' ? linesForSession(id, page) : Promise.resolve({ rows: [] as Line[], total: 0, per: 120 }),
    ]);
    return { s, agents, skills, tools, lines };
  });
  if (error) return <DbError error={error} />;
  if (!data) return <div className="callout warn"><div className="h">Unknown session</div><code>{id}</code></div>;
  const { s, agents, skills, tools, lines } = data;
  const agentByTask = new Map(agents.map((a) => [a.tool_use_id, a]));
  const tabHref = (t: string) => `${sessionHref(id)}?tab=${t}`;
  const pages = Math.max(1, Math.ceil(lines.total / lines.per));

  return (
    <>
      <div className="crumbs"><Link href="/tickets">tickets</Link> / <Link href={`/tickets/${s.ticket_iid}`}>#{s.ticket_iid}</Link> / {s.phase}{s.lap ? ` lap ${s.lap}` : ''}</div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Session</div>
          <h1>{s.phase}{s.lap ? ` · lap ${s.lap}` : ''} <Pill status={s.status} /></h1>
          <p className="sub">#{s.ticket_iid} {s.title} · {shortModel(s.model)} · started {fmtTime(s.started_at)} ({ago(s.started_at)})</p>
        </div>
        {s.status === 'running' ? <AutoRefresh seconds={20} /> : null}
      </div>

      <div className="stats">
        <div className="stat"><div className="v">{fmtInt(s.turns)}</div><div className="l">turns</div></div>
        <div className="stat"><div className="v">{fmtTok(s.tokens_out)}</div><div className="l">output tokens</div></div>
        <div className="stat"><div className="v">{fmtTok(s.tokens_in)}</div><div className="l">input tokens</div><div className="s">{fmtTok(s.cache_read)} cache read · {fmtTok(s.cache_write)} written</div></div>
        <div className="stat"><div className="v">{fmtDur(s.duration_ms)}</div><div className="l">duration</div></div>
        <div className="stat"><div className="v">{agents.length}</div><div className="l">agents</div></div>
        <div className="stat"><div className="v">{skills.length}</div><div className="l">skills</div></div>
        <div className="stat"><div className="v">{fmtInt(tools.length)}</div><div className="l">tool calls</div><div className="s">{tools.filter((t) => t.inside_agent).length} inside agents</div></div>
      </div>

      <div className="panel"><div className="panel-body">
        <dl className="kv">
          <dt>claude session</dt><dd className="mono">{s.claude_session_id ?? '—'}</dd>
          <dt>cwd</dt><dd className="mono">{s.cwd ?? '—'}</dd>
          <dt>transcript</dt><dd className="mono">{s.transcript_path ?? '— (journal-only phase)'} {s.transcript_lines ? `· ${fmtInt(s.transcript_lines)} lines` : ''}</dd>
          <dt>operator</dt><dd>{s.user_email ?? s.operator_id ?? '—'} <span className="mono" style={{ color: 'var(--ink-3)' }}>{s.hostname}</span></dd>
          {s.error_text ? <><dt>error</dt><dd className="err-text mono" style={{ fontSize: '.78rem' }}>{s.error_text}</dd></> : null}
        </dl>
        {s.result_text ? <details className="raw" style={{ marginTop: '.7rem' }}><summary>final result ({fmtInt(s.result_text.length)} chars)</summary><pre>{s.result_text}</pre></details> : null}
      </div></div>

      <div className="tabs">
        <Link href={tabHref('activity')} className={tab === 'activity' ? 'on' : ''}>Activity<span className="cnt">{tools.length}</span></Link>
        <Link href={tabHref('agents')} className={tab === 'agents' ? 'on' : ''}>Agents<span className="cnt">{agents.length}</span></Link>
        <Link href={tabHref('skills')} className={tab === 'skills' ? 'on' : ''}>Skills<span className="cnt">{skills.length}</span></Link>
        <Link href={tabHref('transcript')} className={tab === 'transcript' ? 'on' : ''}>Transcript<span className="cnt">{s.transcript_lines}</span></Link>
      </div>

      {tab === 'activity' ? (
        <Panel title="Every tool call, in order" note="rows tinted teal ran inside a subagent">
          {tools.length ? (
            <div className="scroll">
              <table className="tbl">
                <thead><tr><th className="num">#</th><th>Tool</th><th>Inside</th><th>Input</th><th className="num">Took</th><th>Result</th></tr></thead>
                <tbody>
                  {tools.map((t) => (
                    <tr key={t.tool_use_id} className={t.inside_agent ? 'tint' : undefined}>
                      <td className="num dim">{t.line_no}</td>
                      <td><Link className="rowlink" href={`/tools/${encodeURIComponent(t.tool_use_id)}`}>{t.tool_name}</Link></td>
                      <td>{t.inside_agent ? <span className="chip agent">{t.inside_agent}</span> : <span className="dim">main</span>}</td>
                      <td className="wrap mono" style={{ fontSize: '.76rem' }}>{t.input_summary ?? '—'}</td>
                      <td className="num dim">{fmtDur(t.duration_ms)}</td>
                      <td className="wrap" style={{ fontSize: '.76rem' }}>{t.is_error ? <span className="pill s-bad">error</span> : null} <span className="mono" style={{ color: 'var(--ink-3)' }}>{(t.output_text ?? '').replace(/\s+/g, ' ').slice(0, 140)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No tool calls recorded{s.transcript_path ? '' : ' — this phase ran as code, not as a session'}.</Empty>}
        </Panel>
      ) : null}

      {tab === 'agents' ? (
        agents.length ? agents.map((a) => (
          <Panel key={a.tool_use_id}
            title={<><span className="chip agent">{a.subagent_type}</span> <span style={{ marginLeft: '.4rem' }}>{a.description}</span></>}
            note={<><Pill status={a.status} /> · {a.turns} turns · {fmtTok(a.tokens_out)} out · {fmtTok(a.cache_read)} cache · {a.tool_calls} tools · {fmtDur(a.duration_ms)}{a.parent_tool_use_id && agentByTask.has(a.parent_tool_use_id) ? ` · spawned by ${agentByTask.get(a.parent_tool_use_id)!.subagent_type}` : ''}</>}>
            <div className="panel-body">
              <details className="raw"><summary>prompt ({fmtInt((a.prompt ?? '').length)} chars)</summary><pre>{a.prompt}</pre></details>
              {a.result_text ? <details className="raw" open><summary>report</summary><pre>{a.result_text.slice(0, 12_000)}</pre></details> : <p style={{ color: 'var(--ink-3)' }}>No report yet.</p>}
            </div>
          </Panel>
        )) : <Panel title="Agents"><Empty>This session spawned no subagents.</Empty></Panel>
      ) : null}

      {tab === 'skills' ? (
        <Panel title="Skills invoked">
          {skills.length ? (
            <div className="scroll">
              <table className="tbl">
                <thead><tr><th className="num">#</th><th>Skill</th><th>Invoked from</th><th>Args</th><th>Loaded</th><th>When</th></tr></thead>
                <tbody>
                  {skills.map((k) => (
                    <tr key={k.tool_use_id}>
                      <td className="num dim">{k.line_no}</td>
                      <td><Link href={`/skills?skill=${encodeURIComponent(k.skill_name)}`}><span className="chip skill">{k.skill_name}</span></Link></td>
                      <td>{k.inside_agent ? <span className="chip agent">{k.inside_agent}</span> : <span className="dim">main</span>}</td>
                      <td className="mono wrap" style={{ fontSize: '.74rem' }}>{k.args ?? '—'}</td>
                      <td>{k.ok == null ? <span className="pill s-muted">?</span> : k.ok ? <span className="pill s-ok">ok</span> : <span className="pill s-bad">failed</span>}</td>
                      <td className="dim">{k.invoked_at ? fmtTime(k.invoked_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No skills invoked in this session.</Empty>}
        </Panel>
      ) : null}

      {tab === 'transcript' ? (
        <Panel title="Complete transcript" note={`${fmtInt(lines.total)} lines · page ${page} of ${pages}`}>
          {lines.rows.length ? (
            <div className="tl">
              {lines.rows.map((l) => (
                <div key={l.line_no} className={`tl-line${l.parent_tool_use_id ? ' nested' : ''}`}>
                  <div className="tl-no">{l.line_no}</div>
                  <div className="tl-kind">
                    <span className={`pill ${l.kind === 'assistant' ? 's-live still' : l.kind === 'user' ? 's-muted' : l.kind === 'result' ? 's-ok' : l.kind === 'cli-stderr' ? 's-bad' : 's-warn'}`}>{l.kind}</span>
                    {l.parent_tool_use_id && agentByTask.has(l.parent_tool_use_id) ? <div style={{ marginTop: '.25rem' }}><span className="chip agent">{agentByTask.get(l.parent_tool_use_id)!.subagent_type}</span></div> : null}
                  </div>
                  <LineBody line={l} />
                </div>
              ))}
            </div>
          ) : <Empty>No transcript stored for this session.</Empty>}
          {pages > 1 ? (
            <div className="pager">
              <span>{page > 1 ? <Link href={`${tabHref('transcript')}&page=${page - 1}`}>← earlier</Link> : null}</span>
              <span>lines {(page - 1) * lines.per + 1}–{Math.min(page * lines.per, lines.total)} of {fmtInt(lines.total)}</span>
              <span>{page < pages ? <Link href={`${tabHref('transcript')}&page=${page + 1}`}>later →</Link> : null}</span>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <div className="mono" style={{ fontSize: '.68rem', color: 'var(--ink-3)', display: 'flex', gap: '.5rem', alignItems: 'center' }}>agents in this session: <Chips items={agents.map((a) => a.subagent_type)} kind="agent" /></div>
    </>
  );
}

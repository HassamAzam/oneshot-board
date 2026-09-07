import Link from 'next/link';
import { DbError, Panel, Pill } from '@/components/ui';
import { safe } from '@/lib/db';
import { fmtDur, fmtInt, fmtTime, sessionHref } from '@/lib/format';
import { toolById } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function ToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: t, error } = await safe(() => toolById(decodeURIComponent(id)));
  if (error) return <DbError error={error} />;
  if (!t) return <div className="callout warn"><div className="h">Unknown tool call</div><code>{id}</code></div>;
  return (
    <>
      <div className="crumbs"><Link href="/tickets">tickets</Link> / <Link href={`/tickets/${t.ticket_iid}`}>#{t.ticket_iid}</Link> / <Link href={sessionHref(t.session_id)}>{t.phase}{t.lap ? ` lap ${t.lap}` : ''}</Link> / line {t.line_no}</div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Tool call</div>
          <h1>{t.tool_name} {t.is_error ? <Pill status="error" /> : null}</h1>
          <p className="sub mono" style={{ fontSize: '.8rem' }}>{t.input_summary}</p>
        </div>
      </div>
      <div className="stats">
        <div className="stat"><div className="v" style={{ fontSize: '1rem' }}>{t.inside_agent ?? 'main'}</div><div className="l">ran inside</div></div>
        <div className="stat"><div className="v">{fmtDur(t.duration_ms)}</div><div className="l">duration</div><div className="s">{t.started_at ? fmtTime(t.started_at) : 'no hook timing'}</div></div>
        <div className="stat"><div className="v">{fmtInt((t.output_text ?? '').length)}</div><div className="l">output chars</div></div>
        <div className="stat"><div className="v" style={{ fontSize: '.8rem' }}>{t.tool_use_id}</div><div className="l">tool_use_id</div></div>
      </div>
      <Panel title="Input">
        <div className="panel-body"><pre>{JSON.stringify(t.input, null, 2)}</pre></div>
      </Panel>
      <Panel title="Output" note={t.is_error ? 'the tool reported an error' : undefined}>
        <div className="panel-body"><pre className={t.is_error ? 'err-text' : undefined}>{t.output_text ?? '(no result recorded)'}</pre></div>
      </Panel>
    </>
  );
}

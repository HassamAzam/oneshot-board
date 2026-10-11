import Link from 'next/link';
import { DbError, Empty, Panel, Pill, Tile } from '@/components/ui';
import { safe } from '@/lib/db';
import { ago, fmtInt, fmtTok } from '@/lib/format';
import { allTickets, operatorsWithCounts } from '@/lib/queries';
import OperatorFilter from '@/components/OperatorFilter';

export const dynamic = 'force-dynamic';

export default async function Tickets({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const operator = (Array.isArray(sp.operator) ? sp.operator[0] : sp.operator) || undefined;
  const { data, error } = await safe(async () => {
    const [tickets, operators] = await Promise.all([allTickets(operator), operatorsWithCounts()]);
    return { tickets, operators };
  });
  if (error || !data) return <DbError error={error ?? 'no data'} />;
  const { tickets, operators } = data;
  const shipped = tickets.filter((t) => t.status === 'done').length;
  const liveNow = tickets.filter((t) => t.status === 'running' || t.status === 'claimed').length;
  const totalOut = tickets.reduce((a, t) => a + Number(t.tokens_out), 0);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Tickets</div>
          <h1>Every ticket the pipeline has touched</h1>
          <p className="sub">{fmtInt(tickets.length)} tickets. A ticket that ran more than once lists every run.</p>
        </div>
      </div>
      <div className="tiles">
        <Tile lead label="tickets" value={fmtInt(tickets.length)} sub="all time" />
        <Tile label="shipped" tone="ok" value={fmtInt(shipped)} sub="passed all phases" />
        <Tile label="running now" live={liveNow > 0} value={fmtInt(liveNow)} sub="latest run live" />
        <Tile label="output tokens" value={fmtTok(totalOut)} sub="across all tickets" />
      </div>
      <OperatorFilter operators={operators} selected={operator} path="/tickets" />
      <Panel title="Tickets" note="latest run first">
        {tickets.length ? (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Ticket</th><th>Latest status</th><th className="num">Runs</th><th className="num">Sessions</th><th className="num">Output tokens</th><th>Who</th><th>Last started</th></tr></thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.ticket_iid}>
                    <td className="title"><Link className="rowlink" href={`/tickets/${t.ticket_iid}`}>#{t.ticket_iid}</Link> {t.title}</td>
                    <td><Pill status={t.status} /></td>
                    <td className="num">{t.runs}</td>
                    <td className="num">{t.sessions}</td>
                    <td className="num">{fmtTok(t.tokens_out)}</td>
                    <td className="who">{(t.operators as string[] | null)?.join(', ') ?? '—'}</td>
                    <td className="dim">{ago(t.last_started)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No tickets yet.</Empty>}
      </Panel>
    </>
  );
}

import Link from 'next/link';
import { DbError, Empty, Panel, Pill } from '@/components/ui';
import { safe } from '@/lib/db';
import { ago, fmtInt, fmtTok } from '@/lib/format';
import { allTickets } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function Tickets() {
  const { data, error } = await safe(allTickets);
  if (error || !data) return <DbError error={error ?? 'no data'} />;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Tickets</div>
          <h1>Every ticket the pipeline has touched</h1>
          <p className="sub">{fmtInt(data.length)} tickets. A ticket that ran more than once lists every run.</p>
        </div>
      </div>
      <Panel title="Tickets" note="latest run first">
        {data.length ? (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Ticket</th><th>Latest status</th><th className="num">Runs</th><th className="num">Sessions</th><th className="num">Output tokens</th><th>Last started</th></tr></thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.ticket_iid}>
                    <td className="title"><Link className="rowlink" href={`/tickets/${t.ticket_iid}`}>#{t.ticket_iid}</Link> {t.title}</td>
                    <td><Pill status={t.status} /></td>
                    <td className="num">{t.runs}</td>
                    <td className="num">{t.sessions}</td>
                    <td className="num">{fmtTok(t.tokens_out)}</td>
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

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Keeps the database under the free tier's 500 MB. For sessions that ended more than
 * RETENTION_DAYS ago (default 60; 0 disables), the bulky columns go: transcript lines and
 * tool-call inputs/outputs. Sessions, agent calls, skill calls and tool-call metadata
 * (name, summary, timing, error flag) are kept forever — they are what the board is for.
 * The collector calls this once a day; `?dry=1` only reports what would be pruned.
 */
function authorized(req: NextRequest): boolean {
  const token = process.env.INGEST_TOKEN ?? '';
  const header = req.headers.get('authorization') ?? '';
  if (!token || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const days = Number(process.env.RETENTION_DAYS ?? 60);
  if (!Number.isFinite(days) || days <= 0) return NextResponse.json({ ok: true, disabled: true, days });
  const dry = req.nextUrl.searchParams.get('dry') === '1';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const old = `select session_id from sessions where ended_at is not null and ended_at < now() - ($1::int * interval '1 day')`;
    const [{ rows: [lines] }, { rows: [tools] }, { rows: [sessions] }] = await Promise.all([
      client.query(`select count(*)::int as n from transcript_lines where session_id in (${old})`, [days]),
      client.query(`select count(*)::int as n from tool_calls where (output_text is not null or input is not null) and session_id in (${old})`, [days]),
      client.query(`select count(*)::int as n from sessions where ended_at is not null and ended_at < now() - ($1::int * interval '1 day')`, [days]),
    ]);
    let deletedLines = 0, prunedTools = 0;
    if (!dry) {
      deletedLines = (await client.query(`delete from transcript_lines where session_id in (${old})`, [days])).rowCount ?? 0;
      prunedTools = (await client.query(`update tool_calls set output_text = null, input = null where (output_text is not null or input is not null) and session_id in (${old})`, [days])).rowCount ?? 0;
    }
    await client.query('COMMIT');
    const [{ size }] = (await client.query(`select pg_size_pretty(pg_database_size(current_database())) as size`)).rows;
    return NextResponse.json({ ok: true, dry, days, sessions_affected: sessions.n, transcript_lines: dry ? lines.n : deletedLines, tool_calls_pruned: dry ? tools.n : prunedTools, database_size: size });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}

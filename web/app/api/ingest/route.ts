import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Spec = { pk: string[]; cols: string[]; json: string[]; guard?: string; touch?: boolean };
const SPEC: Record<string, Spec> = {
  operators: { pk: ['id'], cols: ['id', 'user_email', 'git_email', 'hostname', 'os_user', 'last_seen'], json: [] },
  runs: { pk: ['run_id'], cols: ['run_id', 'ticket_iid', 'title', 'url', 'status', 'branch', 'mr_iid', 'merged_sha', 'deployed_sha', 'blocked_why', 'operator_id', 'archived', 'started_at', 'ended_at'], json: [], touch: true },
  sessions: { pk: ['session_id'], cols: ['session_id', 'claude_session_id', 'run_id', 'ticket_iid', 'phase', 'lap', 'model', 'status', 'cwd', 'turns', 'tokens_in', 'tokens_out', 'cache_read', 'cache_write', 'weighted', 'started_at', 'ended_at', 'duration_ms', 'result_text', 'error_text', 'transcript_path', 'transcript_lines', 'seq', 'operator_id'], json: [], guard: 'sessions.seq <= EXCLUDED.seq', touch: true },
  agent_calls: { pk: ['tool_use_id'], cols: ['tool_use_id', 'session_id', 'parent_tool_use_id', 'subagent_type', 'description', 'prompt', 'line_no', 'turns', 'tokens_in', 'tokens_out', 'cache_read', 'cache_write', 'tool_calls', 'status', 'result_text', 'started_at', 'ended_at', 'duration_ms'], json: [] },
  skill_calls: { pk: ['tool_use_id'], cols: ['tool_use_id', 'session_id', 'parent_tool_use_id', 'inside_agent', 'skill_name', 'args', 'line_no', 'ok', 'invoked_at'], json: [] },
  tool_calls: { pk: ['tool_use_id'], cols: ['tool_use_id', 'session_id', 'parent_tool_use_id', 'inside_agent', 'tool_name', 'input_summary', 'input', 'output_text', 'is_error', 'line_no', 'started_at', 'ended_at', 'duration_ms'], json: ['input'] },
  transcript_lines: { pk: ['session_id', 'line_no'], cols: ['session_id', 'line_no', 'kind', 'subtype', 'parent_tool_use_id', 'body'], json: ['body'] },
};
const ORDER = ['operators', 'runs', 'sessions', 'agent_calls', 'skill_calls', 'tool_calls', 'transcript_lines'];

function authorized(req: NextRequest): boolean {
  const token = process.env.INGEST_TOKEN ?? '';
  const header = req.headers.get('authorization') ?? '';
  if (!token || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function upsert(client: PoolClient, table: string, rows: Record<string, unknown>[] | undefined): Promise<number> {
  if (!rows?.length) return 0;
  const spec = SPEC[table];
  const chunkSize = Math.max(1, Math.floor(30_000 / spec.cols.length));
  const updates = spec.cols.filter((c) => !spec.pk.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
  if (spec.touch) updates.push('updated_at = now()');
  let n = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (const r of chunk) {
      const ph: string[] = [];
      for (const c of spec.cols) {
        const isJson = spec.json.includes(c);
        params.push(isJson ? JSON.stringify(r[c] ?? null) : (r[c] ?? null));
        ph.push(`$${params.length}${isJson ? '::jsonb' : ''}`);
      }
      tuples.push(`(${ph.join(',')})`);
    }
    const sql = `INSERT INTO ${table} (${spec.cols.join(',')}) VALUES ${tuples.join(',')} ` +
      `ON CONFLICT (${spec.pk.join(',')}) DO UPDATE SET ${updates.join(', ')}${spec.guard ? ` WHERE ${spec.guard}` : ''}`;
    const res = await client.query(sql, params);
    n += res.rowCount ?? 0;
  }
  return n;
}

export async function POST(req: NextRequest) {
  if (!process.env.INGEST_TOKEN) return NextResponse.json({ error: 'INGEST_TOKEN is not configured on the server' }, { status: 500 });
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: Record<string, Record<string, unknown>[]>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'body must be JSON' }, { status: 400 }); }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const counts: Record<string, number> = {};
    for (const t of ORDER) counts[t] = await upsert(client, t, body[t]);
    await client.query('COMMIT');
    return NextResponse.json({ ok: true, counts });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.slice(0, 600) }, { status: 500 });
  } finally {
    client.release();
  }
}

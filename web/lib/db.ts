import { Pool } from 'pg';

const url = process.env.DATABASE_URL ?? '';
const local = /localhost|127\.0\.0\.1/.test(url);
const g = globalThis as unknown as { __oneshotPool?: Pool };

/** One small pool per lambda/process. Supabase's transaction pooler wants few, short-lived connections. */
export const pool: Pool =
  g.__oneshotPool ??
  (g.__oneshotPool = new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: local || process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false },
  }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}

/** Run a page's queries, turning a database failure into a renderable message instead of a crash. */
export async function safe<T>(fn: () => Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

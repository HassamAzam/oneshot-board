#!/usr/bin/env node
/**
 * Fold one operator's history into another:  npm run db:merge-operator -- <from-id> <to-id>
 *
 * Identity changed once already (account email -> GitHub login), and a change like that
 * otherwise leaves one person showing up as two on the board, splitting their history.
 * This repoints every run and session, keeps the richest field values, and drops the
 * old row. Idempotent: a second run finds nothing to move.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Pool } from 'pg';

// USE_ENV_LOCAL=0 ignores the local env files, for when .env.local points at a
// scratch database and you mean the deployed one.
for (const f of (process.env.USE_ENV_LOCAL === '0' ? [] : ['.env.local', '.env'])) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const [from, to] = process.argv.slice(2);
if (!from || !to) { console.error('usage: npm run db:merge-operator -- <from-id> <to-id>'); process.exit(1); }
if (from === to) { console.error('those are the same id'); process.exit(1); }

/** Say which database is about to be touched. A migration that is quiet about its
 *  target is how you migrate the wrong one and believe you migrated the right one. */
function announce(url) {
  try {
    const u = new URL(url);
    const where = /localhost|127\.0\.0\.1/.test(u.hostname) ? '  ** LOCAL — not your deployed board **' : '';
    console.log(`\nTarget: ${decodeURIComponent(u.username) || '(no user)'}@${u.hostname}:${u.port || '5432'}/${u.pathname.replace(/^\//, '')}${where}`);
  } catch { console.log('\nTarget: (unparseable connection string)'); }
}

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = rl._writeToOutput;
    rl.question(prompt, (v) => { rl.close(); process.stdout.write('\n'); resolve(v.trim()); });
    rl._writeToOutput = function (s) { if (s.includes(prompt)) w.call(this, prompt); };
  });
}
const url = process.env.DATABASE_URL || (await ask('Paste the connection string (hidden): '));
announce(url);
if (!url) { console.error('nothing pasted'); process.exit(1); }

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 20_000, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  const { rows: [src] } = await client.query('select * from operators where id = $1', [from]);
  if (!src) { console.log(`\nNo operator "${from}" — nothing to do.\n`); process.exit(0); }
  await client.query('BEGIN');
  // Create the target if it does not exist yet, carrying the source's details across.
  await client.query(
    `insert into operators (id, github_login, user_email, git_email, hostname, os_user, first_seen, last_seen)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (id) do update set
       github_login = coalesce(operators.github_login, excluded.github_login),
       user_email   = coalesce(operators.user_email,   excluded.user_email),
       git_email    = coalesce(operators.git_email,    excluded.git_email),
       hostname     = coalesce(operators.hostname,     excluded.hostname),
       os_user      = coalesce(operators.os_user,      excluded.os_user),
       first_seen   = least(operators.first_seen, excluded.first_seen),
       last_seen    = greatest(operators.last_seen, excluded.last_seen)`,
    [to, src.github_login ?? to, src.user_email, src.git_email, src.hostname, src.os_user, src.first_seen, src.last_seen],
  );
  const r = await client.query('update runs set operator_id = $2 where operator_id = $1', [from, to]);
  const s = await client.query('update sessions set operator_id = $2 where operator_id = $1', [from, to]);
  await client.query('delete from operators where id = $1', [from]);
  await client.query('COMMIT');
  console.log(`\n✓ moved ${r.rowCount} run(s) and ${s.rowCount} session(s) from "${from}" to "${to}", and removed the old operator.\n`);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\nFAILED: ${e.message}\n`);
  process.exitCode = 1;
} finally {
  client.release(); await pool.end().catch(() => {});
}

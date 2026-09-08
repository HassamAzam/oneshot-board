#!/usr/bin/env node
/**
 * Apply supabase/schema.sql to the database:  npm run db:migrate
 *
 * Same effect as pasting the file into Supabase's SQL editor, minus the copy-paste failure
 * modes. Every statement is CREATE ... IF NOT EXISTS / CREATE OR REPLACE, so running it on a
 * populated database changes nothing and loses nothing. Prompts for the URI if DATABASE_URL
 * is unset; the input is hidden and never written to disk.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Pool } from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, '..', '..', 'supabase', 'schema.sql');

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

const sql = readFileSync(FILE, 'utf8');
const url = process.env.DATABASE_URL || (await ask('Paste the connection string (hidden): '));
announce(url);
if (!url) { console.error('nothing pasted'); process.exit(1); }

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 20_000, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
const want = ['agent_calls', 'operators', 'runs', 'sessions', 'skill_calls', 'tool_calls', 'transcript_lines', 'users'];
const list = async () => new Set(
  (await pool.query('select tablename from pg_tables where schemaname = $1', ['public'])).rows.map((r) => r.tablename),
);

try {
  const before = await list();
  console.log(`\nBefore: ${before.size ? [...before].sort().join(', ') : '(no tables)'}`);
  process.stdout.write('Applying schema… ');
  await pool.query(sql);
  console.log('done');
  const after = await list();
  const added = [...after].filter((t) => !before.has(t)).sort();
  console.log(`\nAfter:  ${[...after].sort().join(', ')}`);
  if (added.length) console.log(`Added:  ${added.join(', ')}`);
  const missing = want.filter((t) => !after.has(t));
  if (missing.length) { console.log(`\n✗ still missing: ${missing.join(', ')}`); process.exitCode = 1; }
  else console.log('\n✓ all 8 board tables present. Reload /api/health — it should report ok:true.\n');
} catch (e) {
  console.log('FAILED\n');
  console.log(`  ${e.message}\n`);
  if (/permission denied/i.test(e.message)) console.log('  → That role cannot create tables. Use the postgres user from Supabase -> Connect.');
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

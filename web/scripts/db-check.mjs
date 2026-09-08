#!/usr/bin/env node
/**
 * Check a Postgres connection string before putting it in Vercel:  npm run db:check
 *
 * Prompts for the URI (hidden, never written to disk or shell history), reports how it is
 * parsed — with the password redacted — flags the mistakes Supabase's two connection modes
 * invite, then actually connects and lists the board's tables.
 */
import { createInterface } from 'node:readline';
import { Pool } from 'pg';

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

const raw = process.env.DATABASE_URL || (await ask('Paste the connection string (hidden): '));
if (!raw) { console.error('nothing pasted'); process.exit(1); }
announce(raw);

const after = raw.slice(raw.indexOf('://') + 3);
const bad = ['#', '?'].filter((c) => { const i = after.indexOf(c); return i > -1 && i < after.lastIndexOf('@'); });
if (bad.length) {
  console.error(`\n✗ The password contains "${bad[0]}", which a URI reads as a delimiter — everything after it is silently dropped.`);
  console.error(`  Percent-encode it (${bad[0] === '#' ? '# as %23' : '? as %3F'}), or simpler: Supabase -> Settings -> Database ->`);
  console.error('  Reset database password, choose an alphanumeric one, and copy a fresh URI.\n');
  process.exit(1);
}

let u;
try { u = new URL(raw); } catch {
  console.error('\n✗ Not a valid URI. It must look like:');
  console.error('  postgresql://postgres.<project-ref>:<password>@aws-N-<region>.pooler.supabase.com:6543/postgres\n');
  process.exit(1);
}

const user = decodeURIComponent(u.username);
const host = u.hostname;
const port = u.port || '5432';
const db = u.pathname.replace(/^\//, '') || '(none)';
const pw = decodeURIComponent(u.password);
const ref = (host.match(/^db\.([a-z0-9]+)\.supabase\.co$/) || [])[1];

console.log('\nParsed:');
console.log(`  user      ${user}`);
console.log(`  password  ${pw ? `(${pw.length} chars)` : '(empty)'}`);
console.log(`  host      ${host}`);
console.log(`  port      ${port}`);
console.log(`  database  ${db}\n`);

const problems = [];
if (raw.includes('[') || raw.includes(']')) problems.push('The [ ] placeholder brackets are still in the string — remove them, keeping only the password.');
if (/^db\.[a-z0-9]+\.supabase\.co$/.test(host)) problems.push(`This is the DIRECT connection host, which is IPv6-only and unreachable from Vercel.\n    Use Supabase -> Connect -> Transaction pooler instead (host aws-N-<region>.pooler.supabase.com, port 6543).`);
if (host.includes('pooler.supabase.com') && !user.includes('.')) problems.push(`The pooler routes by username, so it must be "postgres.<project-ref>", not bare "${user}".\n    ${ref ? `Yours is postgres.${ref}` : 'Copy the whole URI from Supabase -> Connect -> Transaction pooler.'}`);
if (host.includes('pooler.supabase.com') && port !== '6543' && port !== '5432') problems.push(`Unexpected pooler port ${port} — transaction pooler is 6543.`);
if (/[ \t\r\n]/.test(raw)) problems.push('There is whitespace in the string — a stray space or newline got pasted.');
if (pw && /[@/]/.test(pw)) problems.push('The password contains @ or / — percent-encode them (%40, %2F) or the URI splits in the wrong place.');
if (problems.length) { console.log('Problems found:'); for (const p of problems) console.log(`  ✗ ${p}`); console.log(); }

process.stdout.write('Connecting… ');
const pool = new Pool({ connectionString: raw, connectionTimeoutMillis: 15_000, ssl: /localhost|127\.0\.0\.1/.test(host) ? undefined : { rejectUnauthorized: false } });
try {
  const { rows } = await pool.query(`select current_user, current_database(), (select count(*) from pg_tables where schemaname='public') as tables`);
  const t = await pool.query(`select string_agg(tablename, ', ' order by tablename) as list from pg_tables where schemaname='public'`);
  console.log('OK\n');
  console.log(`  connected as   ${rows[0].current_user}`);
  console.log(`  database       ${rows[0].current_database}`);
  console.log(`  public tables  ${rows[0].tables}${t.rows[0].list ? `: ${t.rows[0].list}` : ''}`);
  const need = ['agent_calls','operators','runs','sessions','skill_calls','tool_calls','transcript_lines','users'];
  const have = new Set((t.rows[0].list || '').split(', '));
  const missing = need.filter((x) => !have.has(x));
  console.log(missing.length ? `\n  ⚠ missing tables: ${missing.join(', ')} — run supabase/schema.sql in the SQL editor` : '\n  ✓ all 8 board tables present');
  console.log('\nThis string is good. Paste it into Vercel as DATABASE_URL and redeploy.\n');
} catch (e) {
  const m = e.message || String(e);
  console.log('FAILED\n');
  console.log(`  ${m}\n`);
  if (/password authentication failed/i.test(m)) console.log(user.includes('.') ? '  → The username format is right, so the PASSWORD is wrong.\n    Supabase -> Settings -> Database -> Reset database password, then copy a fresh URI.' : `  → Username must be postgres.<project-ref>, not "${user}".`);
  else if (/ENOTFOUND|EAI_AGAIN/i.test(m)) console.log('  → That host does not resolve. Use the Transaction pooler host from Supabase -> Connect.');
  else if (/Tenant or user not found/i.test(m)) console.log('  → The pooler does not recognise that username. Copy the URI from Supabase -> Connect -> Transaction pooler.');
  else if (/ETIMEDOUT|ECONNREFUSED/i.test(m)) console.log('  → Reachable name but no connection — wrong port, or the VPN is blocking it. Transaction pooler is 6543.');
  else if (/does not exist/i.test(m)) console.log('  → Connected, but the database name is wrong. It should be /postgres at the end.');
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

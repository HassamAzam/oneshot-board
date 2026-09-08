#!/usr/bin/env node
/**
 * `npm run user:list` — which accounts exist, and which of them can actually sign in.
 *
 * Prints no password material: a hash is shown only as its algorithm and length.
 * A row whose password_hash is not scrypt was written by hand as plaintext and can
 * never authenticate, which looks identical to a forgotten password from the login page.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Pool } from 'pg';

for (const f of (process.env.USE_ENV_LOCAL === '0' ? [] : ['.env.local', '.env'])) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
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
if (!url) { console.error('nothing pasted'); process.exit(1); }
announce(url);

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 20_000, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
try {
  const { rows } = await pool.query(
    `select username, password_hash like 'scrypt$%' as usable, length(password_hash) as len,
            split_part(password_hash, '$', 1) as alg, created_at, last_login_at
     from users order by username`);
  if (!rows.length) {
    console.log('\nNo accounts exist yet.\n  → npm run user:add -- <username>\n');
  } else {
    console.log(`\n${rows.length} account(s):\n`);
    for (const r of rows) {
      const mark = r.usable ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      const note = r.usable
        ? `${r.alg} hash, ${r.len} chars` + (r.last_login_at ? `, last signed in ${new Date(r.last_login_at).toLocaleString()}` : ', never signed in')
        : '\x1b[31mCANNOT SIGN IN — password_hash holds plaintext, not a hash\x1b[0m';
      console.log(`  ${mark} ${r.username.padEnd(18)} ${note}`);
    }
    const broken = rows.filter((r) => !r.usable);
    console.log(broken.length
      ? `\nFix: npm run user:add -- ${broken[0].username}\n`
      : '\nAll accounts can sign in. If a password is not working, reset it:\n  npm run user:add -- <username>\n');
  }
} catch (e) {
  console.error(`\nFAILED: ${e.message}\n`);
  process.exitCode = 1;
} finally { await pool.end().catch(() => {}); }

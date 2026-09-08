#!/usr/bin/env node
/**
 * Create or reset a board login:   npm run user:add -- <username>
 * Reads DATABASE_URL from the environment or web/.env.local (run `vercel env pull .env.local` first
 * to use the Supabase database). Password is prompted without echo, or taken from USER_PASSWORD.
 * Hash format matches lib/auth.ts: scrypt$N$r$p$<salt>$<key>, all base64url.
 */
import { randomBytes, scryptSync } from 'node:crypto';
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
const username = String(process.argv[2] ?? '').trim().toLowerCase();
if (!username) { console.error('usage: npm run user:add -- <username>'); process.exit(1); }

/** Reads a line without echoing it, so passwords and connection strings stay out of shell history. */
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

if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL is not set. Paste your Supabase Transaction-pooler URI');
  console.log('(Supabase -> Project Settings -> Database -> Connection string -> URI, Transaction pooler, port 6543).');
  console.log('Input is hidden and is never written to disk.\n');
  process.env.DATABASE_URL = await ask('DATABASE_URL: ');
}
announce(process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) { console.error('no DATABASE_URL given'); process.exit(1); }
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) { console.error('that does not look like a postgres URI'); process.exit(1); }
if (process.env.DATABASE_URL.includes('[YOUR-PASSWORD]')) { console.error('replace [YOUR-PASSWORD] in the URI with your database password first'); process.exit(1); }
let password = process.env.USER_PASSWORD ?? '';
if (!password) {
  password = await ask(`password for ${username}: `);
  const again = await ask('again: ');
  if (password !== again) { console.error('passwords differ'); process.exit(1); }
}
if (password.length < 8) { console.error('use at least 8 characters'); process.exit(1); }

const N = 16384, r = 8, p = 1;
const salt = randomBytes(16);
const key = scryptSync(password.normalize('NFKC'), salt, 64, { N, r, p });
const hash = `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;

const url = process.env.DATABASE_URL;
announce(url);
const pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
await pool.query(`create table if not exists users (username text primary key, password_hash text not null, created_at timestamptz not null default now(), last_login_at timestamptz)`);
const res = await pool.query(
  `insert into users (username, password_hash) values ($1, $2)
   on conflict (username) do update set password_hash = excluded.password_hash returning (xmax = 0) as created`,
  [username, hash],
);
await pool.end();
console.log(`${res.rows[0].created ? 'created' : 'password reset for'} user "${username}"`);

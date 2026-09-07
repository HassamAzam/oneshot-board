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

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const username = String(process.argv[2] ?? '').trim().toLowerCase();
if (!username) { console.error('usage: npm run user:add -- <username>'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (env or web/.env.local)'); process.exit(1); }

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = rl._writeToOutput;
    rl.question(prompt, (v) => { rl.close(); process.stdout.write('\n'); resolve(v); });
    rl._writeToOutput = function (s) { if (s.includes(prompt)) w.call(this, prompt); };
  });
}
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
const pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
await pool.query(`create table if not exists users (username text primary key, password_hash text not null, created_at timestamptz not null default now(), last_login_at timestamptz)`);
const res = await pool.query(
  `insert into users (username, password_hash) values ($1, $2)
   on conflict (username) do update set password_hash = excluded.password_hash returning (xmax = 0) as created`,
  [username, hash],
);
await pool.end();
console.log(`${res.rows[0].created ? 'created' : 'password reset for'} user "${username}"`);

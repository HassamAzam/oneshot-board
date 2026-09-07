#!/usr/bin/env node
/**
 * Print a ready-to-paste SQL statement for a board login:  npm run user:hash -- <username>
 *
 * For when it is easier to run one statement in Supabase's SQL editor than to hand the
 * collector a connection string. The password is hashed here and never leaves this machine;
 * only the scrypt hash appears in the SQL.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';

const username = String(process.argv[2] ?? '').trim().toLowerCase();
if (!username) { console.error('usage: npm run user:hash -- <username>'); process.exit(1); }

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
  password = await ask(`password for ${username} (hidden): `);
  if (password !== (await ask('again: '))) { console.error('passwords differ'); process.exit(1); }
}
if (password.length < 8) { console.error('use at least 8 characters'); process.exit(1); }

const N = 16384, r = 8, p = 1;
const salt = randomBytes(16);
const hash = `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${scryptSync(password.normalize('NFKC'), salt, 64, { N, r, p }).toString('base64url')}`;
const sql = `insert into users (username, password_hash) values ('${username.replace(/'/g, "''")}', '${hash}')
  on conflict (username) do update set password_hash = excluded.password_hash;`;
console.log(`\nRun this in Supabase -> SQL Editor:\n\n${sql}\n\nThen sign in as "${username}" with the password you just typed.\n`);

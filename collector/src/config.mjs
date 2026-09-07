import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Load collector/.env. Never overrides a variable already in the environment.
for (const p of [join(HERE, '..', '.env')]) {
  if (!existsSync(p)) continue;
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

// An empty value in .env means "unset", not "empty string" — ONESHOT_HOME= is
// present-but-blank in the shipped .env.example, and ?? would hand back ''.
const env = (k, d = '') => { const v = process.env[k]; return v === undefined || v === '' ? d : v; };
const num = (k, d) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : d; };
const flag = (k) => /^(1|true|yes)$/i.test(process.env[k] ?? '');

export const CFG = {
  oneshotHome: env('ONESHOT_HOME', join(homedir(), 'Documents', 'oneshot')),
  boardUrl: env('BOARD_URL', '').replace(/\/+$/, ''),
  ingestToken: env('INGEST_TOKEN', ''),
  stateDir: env('BOARD_STATE_DIR', join(homedir(), '.oneshot-board')),
  scanMs: num('SCAN_INTERVAL_MS', 5_000),
  flushMs: num('FLUSH_INTERVAL_MS', 60_000),
  maxBatchBytes: num('MAX_BATCH_BYTES', 1_500_000),
  maxToolOutputBytes: num('MAX_TOOL_OUTPUT_BYTES', 512_000),
  maxLineBytes: num('MAX_LINE_BYTES', 1_000_000),
  abandonAfterMs: num('ABANDON_AFTER_MS', 15 * 60_000),
  dryRun: flag('DRY_RUN'),
};

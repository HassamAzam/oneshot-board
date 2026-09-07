# Oneshot Board

Every session, agent, skill, tool call and transcript from the Oneshot pipeline, posted from your desk to a hosted dashboard every 60 seconds.

```
Oneshot state/  ──▶  collector (node, zero deps)  ──▶  POST /api/ingest  ──▶  Supabase Postgres  ──▶  Next.js board on Vercel
```

| Part | Where it runs | What it needs |
|---|---|---|
| `collector/` | your laptop, next to Oneshot | Node ≥ 20. No `npm install`. |
| `web/` | Vercel | Supabase Postgres, four env vars |

Nothing here touches `~/Documents/oneshot`; the collector only reads `state/runs/**` and `state/hook-events.jsonl`.

---

## 1. Supabase (5 minutes)

1. Create a project at https://supabase.com/dashboard. Save the database password.
2. **SQL Editor → New query** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Project Settings → Database → Connection string → URI**, pick the **Transaction** pooler (port `6543`), fill in the password. That string is your `DATABASE_URL`.

Nothing else from Supabase is used — no anon key, no service-role key, no RLS. The board talks to Postgres directly; logins live in its `users` table as scrypt hashes.

## 2. Vercel

Import this repo, set **Root Directory = `web`**. Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Supabase **Transaction pooler** URI from step 1.3 |
| `INGEST_TOKEN` | a long random secret — `openssl rand -hex 32` — the collector presents the same value |
| `SESSION_SECRET` | signs the login session cookie — `openssl rand -hex 32` |

Deploy, then check `https://<your-app>.vercel.app/api/health` → `{"ok":true,...}`.

### Create your login

Accounts are rows in the `users` table — username plus an scrypt hash of the password, computed on your machine. Pull the deployed env vars once so the script can reach Supabase, then add yourself:

```bash
cd ~/Documents/oneshot-board/web && vercel env pull .env.local && npm run user:add -- hassam
```

It prompts for the password without echo (or takes `USER_PASSWORD=…`). Run it again with the same username to reset a password. Sessions are HttpOnly cookies signed with `SESSION_SECRET`, valid 7 days; **sign out** is in the top bar. `/api/ingest` is unaffected — it authenticates with `INGEST_TOKEN`.

## 3. Collector (your laptop)

```bash
cd ~/Documents/oneshot-board/collector && cp .env.example .env   # then set BOARD_URL and INGEST_TOKEN
```

Dry run — extracts everything Oneshot has on disk, ships nothing:

```bash
cd ~/Documents/oneshot-board && npm run collector:dry
```

The real thing. The first run backfills every existing session; after that it posts only what changed:

```bash
cd ~/Documents/oneshot-board && npm run collector
```

`npm run collector:stats` shows what is waiting in the outbox. `npm run collector:once` does one scan + flush and exits (cron-friendly).

### Keep it running across reboots

```bash
NODE=$(which node); cat > ~/Library/LaunchAgents/com.oneshot.board.collector.plist <<EOT
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.oneshot.board.collector</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$HOME/Documents/oneshot-board/collector/src/index.mjs</string></array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/oneshot-board-collector.log</string>
  <key>StandardErrorPath</key><string>/tmp/oneshot-board-collector.log</string>
</dict></plist>
EOT
launchctl load ~/Library/LaunchAgents/com.oneshot.board.collector.plist
```

---

## How it works

**The transcript is the source of truth.** Oneshot tees every SDK message to `state/runs/<iid>/transcripts/<phase>-lap<n>.jsonl`. That file carries the real `subagent_type` of every agent, every skill name, every tool call with its full input and output, per-turn token usage, and `parent_tool_use_id` linking subagent work to the call that spawned it. Claude Code's native telemetry anonymizes user-defined agents to `"custom"`; the transcript does not.

**Lifecycle of a session on the board**

| Event | When | What ships |
|---|---|---|
| open | within 5 s of the transcript appearing | a `running` session row |
| tick | every 60 s while it grows | cumulative session snapshot + new tool calls, skills, transcript lines |
| close | on the `result` line (or the journal ending it) | final status, usage, outcome |

**Override semantics.** A `sessions` row is a snapshot — it is replaced, guarded by `seq` (the transcript byte offset) so a stale retry can never make the board go backwards. `agent_calls`, `skill_calls`, `tool_calls` and `transcript_lines` are events keyed by their own ids — they only ever accumulate. The ingest route never deletes.

**The outbox.** Rows are written to `~/.oneshot-board/outbox.json` before they are sent and removed only on a 2xx. Offline for an hour? The newest snapshot of each session wins and everything ships on reconnect. Kill the collector any time; the next start resumes from `~/.oneshot-board/state.json`.

**Identity.** `operators.id` is Claude Code's authenticated email from `~/.claude.json`, falling back to `git config user.email`, then `os_user@hostname`.

## Data model

```
operators        who: user_email, git_email, hostname, os_user
runs             one Oneshot run: ticket, title, status, branch, MR, SHAs, blocked_why
sessions         one phase attempt: <run_id>/<phase>/lap<n> — model, status, turns, tokens, timing, result
agent_calls      one Task tool call: subagent_type, prompt, report, per-agent turns & tokens, nesting
skill_calls      one Skill tool call: skill_name, args, which agent invoked it
tool_calls       every tool call: name, input (jsonb), output, error flag, timing (from hook events)
transcript_lines the verbatim JSONL, one row per line
```

## If `npm install` hangs on this Mac (FortiClient)

Node resolves `registry.npmjs.org` to IPv6 addresses the VPN black-holes, so every fetch times out while `curl` works. Force IPv4 DNS with the bundled preload hook:

```bash
cd ~/Documents/oneshot-board/web && NODE_OPTIONS="--require ../scripts/ipv4-dns.cjs" npm install
```

## Local development

```bash
cd web && npm install
echo 'DATABASE_URL=postgresql://postgres@127.0.0.1:5432/oneshot_board' > .env.local   # any Postgres with schema.sql applied
echo 'INGEST_TOKEN=localtest' >> .env.local
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env.local && npm run user:add -- me       # omit SESSION_SECRET to run the board open
npm run dev                                                                            # http://localhost:3100
BOARD_URL=http://localhost:3100 INGEST_TOKEN=localtest node ../collector/src/index.mjs --once
```

## Knobs (collector/.env)

| Variable | Default | Meaning |
|---|---|---|
| `ONESHOT_HOME` | `~/Documents/oneshot` | where `state/` lives |
| `BOARD_STATE_DIR` | `~/.oneshot-board` | outbox + watermarks |
| `SCAN_INTERVAL_MS` | 5000 | how often new/changed transcripts are noticed |
| `FLUSH_INTERVAL_MS` | 60000 | how often the outbox is posted |
| `MAX_BATCH_BYTES` | 1500000 | request size cap (Vercel allows 4.5 MB) |
| `MAX_TOOL_OUTPUT_BYTES` | 512000 | a single tool output larger than this is truncated with a marker |
| `ABANDON_AFTER_MS` | 900000 | a transcript silent this long with no result line is marked `abandoned` |

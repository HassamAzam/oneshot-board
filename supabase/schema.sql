-- Oneshot Board — Postgres schema. Paste into the Supabase SQL editor and run once.
-- Every table is upsert-only from the collector; nothing here is ever deleted by the pipeline.

create table if not exists operators (
  id           text primary key,                 -- github login, else account email, else os_user@hostname
  github_login text,
  user_email   text,
  git_email    text,
  hostname     text,
  os_user      text,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);

create table if not exists runs (
  run_id       text primary key,                 -- Oneshot run id (r-…)
  ticket_iid   integer not null,
  title        text,
  url          text,
  status       text,                             -- running|blocked|done|aborted|parked
  branch       text,
  mr_iid       integer,
  merged_sha   text,
  deployed_sha text,
  blocked_why  text,
  operator_id  text references operators(id),
  archived     boolean not null default false,
  started_at   timestamptz,
  ended_at     timestamptz,
  updated_at   timestamptz not null default now()
);
create index if not exists runs_ticket  on runs(ticket_iid);
create index if not exists runs_started on runs(started_at desc);

create table if not exists sessions (
  session_id         text primary key,           -- <run_id>/<phase>/lap<n>
  claude_session_id  text,                       -- Claude Code's own session uuid
  run_id             text not null references runs(run_id) on delete cascade,
  ticket_iid         integer not null,
  phase              text not null,
  lap                integer not null default 0,
  model              text,
  status             text not null default 'running', -- running|ok|warned|failed|refused|skipped|abandoned
  cwd                text,
  turns              integer not null default 0,
  tokens_in          bigint not null default 0,
  tokens_out         bigint not null default 0,
  cache_read         bigint not null default 0,
  cache_write        bigint not null default 0,
  weighted           bigint,                     -- Oneshot's subscription-weighted unit, from the journal
  started_at         timestamptz,
  ended_at           timestamptz,
  duration_ms        bigint,
  result_text        text,
  error_text         text,
  transcript_path    text,
  transcript_lines   integer not null default 0,
  seq                bigint not null default 0,  -- transcript byte offset: the monotonic guard
  operator_id        text references operators(id),
  updated_at         timestamptz not null default now()
);
create index if not exists sessions_run     on sessions(run_id);
create index if not exists sessions_ticket  on sessions(ticket_iid);
create index if not exists sessions_status  on sessions(status);
create index if not exists sessions_started on sessions(started_at desc);

-- A stale snapshot (lower seq) never overwrites a newer one, whatever order retries land in.
create or replace function sessions_seq_guard() returns trigger language plpgsql as $$
begin
  if new.seq < old.seq then return null; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sessions_seq_guard on sessions;
create trigger sessions_seq_guard before update on sessions
  for each row execute function sessions_seq_guard();

create table if not exists agent_calls (
  tool_use_id        text primary key,           -- the Task tool call that spawned the agent
  session_id         text not null references sessions(session_id) on delete cascade,
  parent_tool_use_id text,                       -- set when an agent spawned this agent
  subagent_type      text not null,
  description        text,
  prompt             text,
  line_no            integer,
  turns              integer not null default 0,
  tokens_in          bigint not null default 0,
  tokens_out         bigint not null default 0,
  cache_read         bigint not null default 0,
  cache_write        bigint not null default 0,
  tool_calls         integer not null default 0,
  status             text not null default 'running', -- running|ok|error|abandoned
  result_text        text,
  started_at         timestamptz,
  ended_at           timestamptz,
  duration_ms        integer
);
create index if not exists agent_calls_session on agent_calls(session_id);
create index if not exists agent_calls_type    on agent_calls(subagent_type);

create table if not exists skill_calls (
  tool_use_id        text primary key,
  session_id         text not null references sessions(session_id) on delete cascade,
  parent_tool_use_id text,
  inside_agent       text,                       -- subagent_type when invoked from inside an agent
  skill_name         text not null,
  args               text,
  line_no            integer,
  ok                 boolean,
  invoked_at         timestamptz
);
create index if not exists skill_calls_session on skill_calls(session_id);
create index if not exists skill_calls_name    on skill_calls(skill_name);

create table if not exists tool_calls (
  tool_use_id        text primary key,
  session_id         text not null references sessions(session_id) on delete cascade,
  parent_tool_use_id text,
  inside_agent       text,
  tool_name          text not null,
  input_summary      text,
  input              jsonb,
  output_text        text,
  is_error           boolean not null default false,
  line_no            integer,
  started_at         timestamptz,
  ended_at           timestamptz,
  duration_ms        integer
);
create index if not exists tool_calls_session on tool_calls(session_id);
create index if not exists tool_calls_name    on tool_calls(tool_name);

create table if not exists transcript_lines (
  session_id         text not null references sessions(session_id) on delete cascade,
  line_no            integer not null,
  kind               text,                       -- system|assistant|user|result|cli-stderr
  subtype            text,
  parent_tool_use_id text,
  body               jsonb not null,             -- the verbatim JSONL line
  primary key (session_id, line_no)
);

-- Human review gates: the three points where a Review-labelled run waits for a
-- person. NOT failures — a blocked run is a different thing entirely. The board only
-- DISPLAYS these; the answer is given in Slack or on the GitLab ticket, never here.
create table if not exists interventions (
  id            text primary key,          -- <run_id>:<gate>
  run_id        text not null references runs(run_id) on delete cascade,
  ticket_iid    integer not null,
  gate          text not null,             -- plan | testcases | merge
  state         text not null,             -- waiting | approved | pending
  requested_at  timestamptz,               -- when the ask was posted, if it was
  feedback      jsonb,                     -- replies so far, oldest first
  rounds        integer not null default 0,
  operator_id   text references operators(id),
  updated_at    timestamptz not null default now()
);
create index if not exists interventions_state  on interventions(state);
create index if not exists interventions_ticket on interventions(ticket_iid);

-- Added after the first deployments; harmless to re-run.
alter table operators add column if not exists github_login text;

-- Board logins. password_hash is scrypt (Node built-in), written by `npm run user:add` in web/.
create table if not exists users (
  username       text primary key,
  password_hash  text not null,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz
);

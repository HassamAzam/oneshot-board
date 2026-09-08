import { q } from './db';

export type Run = {
  run_id: string; ticket_iid: number; title: string | null; url: string | null; status: string | null;
  branch: string | null; mr_iid: number | null; merged_sha: string | null; deployed_sha: string | null;
  blocked_why: string | null; operator_id: string | null; archived: boolean; started_at: string | null; ended_at: string | null;
};
export type Session = {
  session_id: string; claude_session_id: string | null; run_id: string; ticket_iid: number; phase: string; lap: number;
  model: string | null; status: string; cwd: string | null; turns: number; tokens_in: string; tokens_out: string;
  cache_read: string; cache_write: string; weighted: string | null; started_at: string | null; ended_at: string | null;
  duration_ms: string | null; result_text: string | null; error_text: string | null; transcript_path: string | null;
  transcript_lines: number; seq: string; operator_id: string | null;
};
export type AgentCall = {
  tool_use_id: string; session_id: string; parent_tool_use_id: string | null; subagent_type: string; description: string | null;
  prompt: string | null; line_no: number | null; turns: number; tokens_in: string; tokens_out: string; cache_read: string;
  cache_write: string; tool_calls: number; status: string; result_text: string | null; started_at: string | null;
  ended_at: string | null; duration_ms: number | null;
};
export type SkillCall = {
  tool_use_id: string; session_id: string; inside_agent: string | null; skill_name: string; args: string | null;
  line_no: number | null; ok: boolean | null; invoked_at: string | null;
};
export type ToolCall = {
  tool_use_id: string; session_id: string; parent_tool_use_id: string | null; inside_agent: string | null; tool_name: string;
  input_summary: string | null; input: unknown; output_text: string | null; is_error: boolean; line_no: number | null;
  started_at: string | null; ended_at: string | null; duration_ms: number | null;
};
export type Line = { session_id: string; line_no: number; kind: string | null; subtype: string | null; parent_tool_use_id: string | null; body: unknown };
export type Intervention = {
  id: string; run_id: string; ticket_iid: number; gate: string; state: string;
  requested_at: string | null; feedback: string[] | null; rounds: number; operator_id: string | null;
  updated_at: string; title: string | null; url: string | null; run_status: string | null;
};

export type Operator = {
  id: string; github_login: string | null; user_email: string | null; git_email: string | null;
  hostname: string | null; os_user: string | null; last_seen: string; sessions: number; runs: number; tokens_out: string;
};

/**
 * Every filtered query takes the operator id as $1 and uses the same guard:
 * `($1::text is null or ... = $1)`. Null therefore means "everyone", which keeps
 * one code path for the unfiltered and filtered views.
 */
const op = (v?: string) => v ?? null;

export async function operatorsWithCounts() {
  return q<Operator>(`
    select o.*,
      (select count(*)::int from sessions s where s.operator_id = o.id) as sessions,
      (select count(*)::int from runs r where r.operator_id = o.id)     as runs,
      (select coalesce(sum(tokens_out),0)::bigint from sessions s where s.operator_id = o.id) as tokens_out
    from operators o order by last_seen desc`);
}

export async function fleetStats(operator?: string) {
  const [r] = await q(`
    select
      (select count(*) from sessions where ($1::text is null or operator_id = $1))            as sessions,
      (select count(*) from sessions where status = 'running' and ($1::text is null or operator_id = $1)) as running,
      (select count(distinct ticket_iid) from runs where ($1::text is null or operator_id = $1)) as tickets,
      (select count(*) from runs where ($1::text is null or operator_id = $1))                as runs,
      (select count(*) from agent_calls a join sessions s using (session_id) where ($1::text is null or s.operator_id = $1)) as agent_calls,
      (select count(*) from skill_calls k join sessions s using (session_id) where ($1::text is null or s.operator_id = $1)) as skill_calls,
      (select count(*) from tool_calls t join sessions s using (session_id)  where ($1::text is null or s.operator_id = $1)) as tool_calls,
      (select coalesce(sum(tokens_out),0) from sessions where started_at > now() - interval '24 hours' and ($1::text is null or operator_id = $1)) as tokens_out_24h,
      (select coalesce(sum(tokens_out),0) from sessions where ($1::text is null or operator_id = $1)) as tokens_out_total,
      (select coalesce(sum(weighted),0)   from sessions where ($1::text is null or operator_id = $1)) as weighted_total,
      (select max(last_seen) from operators where ($1::text is null or id = $1))              as last_seen,
      (select count(*) from operators)                                                        as operators`, [op(operator)]);
  return r;
}

export async function runningSessions(operator?: string) {
  return q<Session & { title: string | null; github_login: string | null }>(`
    select s.*, r.title, o.github_login from sessions s join runs r using (run_id)
      left join operators o on o.id = s.operator_id
    where s.status = 'running' and ($1::text is null or s.operator_id = $1)
    order by s.started_at desc nulls last`, [op(operator)]);
}

export type PhaseChip = { phase: string; lap: number; status: string; model: string | null; turns: number; tokens_out: number; session_id: string };
export type RunWithPhases = Run & {
  github_login: string | null; user_email: string | null; hostname: string | null;
  n_sessions: string; tokens_out: string; weighted: string; phases: PhaseChip[] | null;
};
export async function recentRuns(limit = 40, operator?: string) {
  return q<RunWithPhases>(`
    select r.*, o.github_login, o.user_email, o.hostname,
      (select count(*) from sessions s where s.run_id = r.run_id) as n_sessions,
      (select coalesce(sum(tokens_out),0) from sessions s where s.run_id = r.run_id) as tokens_out,
      (select coalesce(sum(weighted),0) from sessions s where s.run_id = r.run_id) as weighted,
      (select json_agg(json_build_object('phase', s.phase, 'lap', s.lap, 'status', s.status, 'model', s.model,
                                         'turns', s.turns, 'tokens_out', s.tokens_out, 'session_id', s.session_id)
                       order by s.started_at nulls last, s.lap)
         from sessions s where s.run_id = r.run_id) as phases
    from runs r left join operators o on o.id = r.operator_id
    where ($2::text is null or r.operator_id = $2)
    order by r.started_at desc nulls last limit $1`, [limit, op(operator)]);
}

export async function agentSummary(operator?: string) {
  return q(`
    select a.subagent_type, count(*)::int as calls, sum((a.status='ok')::int)::int as ok,
           sum((a.status in ('error','abandoned'))::int)::int as failed, sum(a.turns)::bigint as turns,
           sum(a.tokens_out)::bigint as tokens_out, sum(a.tokens_in)::bigint as tokens_in, sum(a.cache_read)::bigint as cache_read,
           sum(a.tool_calls)::int as tool_calls, round(avg(a.duration_ms))::int as avg_ms,
           count(distinct a.session_id)::int as sessions, max(coalesce(a.ended_at, a.started_at)) as last_used
    from agent_calls a join sessions s using (session_id)
    where ($1::text is null or s.operator_id = $1)
    group by 1 order by tokens_out desc`, [op(operator)]);
}

export async function agentCalls(subagentType?: string, limit = 60, operator?: string) {
  return q<AgentCall & { phase: string; ticket_iid: number; lap: number; operator_id: string | null }>(`
    select a.*, s.phase, s.ticket_iid, s.lap, s.operator_id from agent_calls a join sessions s using (session_id)
    where ($1::text is null or a.subagent_type = $1) and ($3::text is null or s.operator_id = $3)
    order by coalesce(a.started_at, s.started_at) desc nulls last, a.line_no desc limit $2`,
    [subagentType ?? null, limit, op(operator)]);
}

export async function skillSummary(operator?: string) {
  return q(`
    select k.skill_name, count(*)::int as calls, count(distinct k.session_id)::int as sessions,
           sum((k.ok is false)::int)::int as failures,
           coalesce(json_agg(distinct k.inside_agent) filter (where k.inside_agent is not null), '[]') as agents,
           coalesce(json_agg(distinct s.phase), '[]') as phases,
           max(coalesce(k.invoked_at, s.started_at)) as last_used
    from skill_calls k join sessions s using (session_id)
    where ($1::text is null or s.operator_id = $1)
    group by 1 order by calls desc`, [op(operator)]);
}

export async function skillCalls(skill?: string, limit = 80, operator?: string) {
  return q<SkillCall & { phase: string; ticket_iid: number; lap: number; operator_id: string | null }>(`
    select k.*, s.phase, s.ticket_iid, s.lap, s.operator_id from skill_calls k join sessions s using (session_id)
    where ($1::text is null or k.skill_name = $1) and ($3::text is null or s.operator_id = $3)
    order by coalesce(k.invoked_at, s.started_at) desc nulls last, k.line_no desc limit $2`,
    [skill ?? null, limit, op(operator)]);
}

export async function toolSummary(operator?: string) {
  return q(`
    select t.tool_name, count(*)::int as calls, sum(t.is_error::int)::int as errors,
           sum((t.inside_agent is not null)::int)::int as inside_agents, round(avg(t.duration_ms))::int as avg_ms
    from tool_calls t join sessions s using (session_id)
    where ($1::text is null or s.operator_id = $1)
    group by 1 order by calls desc`, [op(operator)]);
}

export async function allTickets(operator?: string) {
  return q(`
    select r.ticket_iid, max(r.title) as title, count(distinct r.run_id)::int as runs,
           (select count(*)::int from sessions s where s.ticket_iid = r.ticket_iid and ($1::text is null or s.operator_id = $1)) as sessions,
           (select coalesce(sum(tokens_out),0)::bigint from sessions s where s.ticket_iid = r.ticket_iid and ($1::text is null or s.operator_id = $1)) as tokens_out,
           max(r.started_at) as last_started,
           (array_agg(r.status order by r.started_at desc nulls last))[1] as status,
           (array_agg(distinct coalesce(o.github_login, r.operator_id)) filter (where r.operator_id is not null)) as operators
    from runs r left join operators o on o.id = r.operator_id
    where ($1::text is null or r.operator_id = $1)
    group by r.ticket_iid order by last_started desc nulls last`, [op(operator)]);
}

export async function ticketRuns(iid: number) {
  return q<Run & { github_login: string | null; user_email: string | null; hostname: string | null }>(`
    select r.*, o.github_login, o.user_email, o.hostname from runs r left join operators o on o.id = r.operator_id
    where r.ticket_iid = $1 order by r.started_at desc nulls last`, [iid]);
}

export type SessionWithCounts = Session & { n_agents: number; n_skills: number; n_tools: number; agent_types: string[] | null; skill_names: string[] | null };
export async function sessionsForRun(runId: string) {
  return q<SessionWithCounts>(`
    select s.*,
      (select count(*)::int from agent_calls a where a.session_id = s.session_id) as n_agents,
      (select count(*)::int from skill_calls k where k.session_id = s.session_id) as n_skills,
      (select count(*)::int from tool_calls t where t.session_id = s.session_id) as n_tools,
      (select array_agg(distinct subagent_type) from agent_calls a where a.session_id = s.session_id) as agent_types,
      (select array_agg(distinct skill_name) from skill_calls k where k.session_id = s.session_id) as skill_names
    from sessions s where s.run_id = $1
    order by s.started_at nulls last, s.lap`, [runId]);
}

export async function sessionById(id: string) {
  const [s] = await q<Session & { title: string | null; url: string | null; run_status: string | null; github_login: string | null; user_email: string | null; hostname: string | null }>(`
    select s.*, r.title, r.url, r.status as run_status, o.github_login, o.user_email, o.hostname
    from sessions s join runs r using (run_id) left join operators o on o.id = s.operator_id
    where s.session_id = $1`, [id]);
  return s ?? null;
}
export async function agentsForSession(id: string) {
  return q<AgentCall>(`select * from agent_calls where session_id = $1 order by line_no`, [id]);
}
export async function skillsForSession(id: string) {
  return q<SkillCall>(`select * from skill_calls where session_id = $1 order by line_no`, [id]);
}
export async function toolsForSession(id: string) {
  return q<ToolCall>(`
    select tool_use_id, session_id, parent_tool_use_id, inside_agent, tool_name, input_summary, is_error, line_no,
           started_at, ended_at, duration_ms, left(output_text, 600) as output_text, null::jsonb as input
    from tool_calls where session_id = $1 order by line_no`, [id]);
}
export async function toolById(id: string) {
  const [t] = await q<ToolCall & { phase: string; ticket_iid: number; lap: number }>(`
    select t.*, s.phase, s.ticket_iid, s.lap from tool_calls t join sessions s using (session_id) where t.tool_use_id = $1`, [id]);
  return t ?? null;
}
export async function linesForSession(id: string, page: number, per = 120) {
  const rows = await q<Line>(`select * from transcript_lines where session_id = $1 order by line_no offset $2 limit $3`,
    [id, (page - 1) * per, per]);
  const [{ count }] = await q<{ count: string }>(`select count(*) from transcript_lines where session_id = $1`, [id]);
  return { rows, total: Number(count), per };
}


/**
 * The human review gates. Waiting first, because that is the whole point of the page;
 * everything else is history. `open` filters to the gates that still owe an answer.
 */
export async function interventions(operator?: string, open = false) {
  return q<Intervention>(`
    select i.*, r.title, r.url, r.status as run_status
    from interventions i join runs r using (run_id)
    where ($1::text is null or i.operator_id = $1)
      and ($2::boolean is false or i.state <> 'approved')
    order by (i.state = 'waiting') desc, (i.state = 'pending') desc, i.updated_at desc`,
    [op(operator), open]);
}

export async function interventionCounts(operator?: string) {
  // 'testcases' is the only QA gate; plan, review and merge are all a developer's call.
  const [r] = await q(`
    select count(*) filter (where state = 'waiting')  as waiting,
           count(*) filter (where state = 'pending')  as pending,
           count(*) filter (where state = 'approved') as approved,
           count(distinct ticket_iid) filter (where state <> 'approved') as tickets_waiting,
           count(*) filter (where state <> 'approved' and gate = 'testcases')  as qa_open,
           count(*) filter (where state <> 'approved' and gate <> 'testcases') as dev_open,
           count(*) filter (where state <> 'approved')                         as open
    from interventions where ($1::text is null or operator_id = $1)`, [op(operator)]);
  return r;
}

/** Just the badge number. Cheap enough to run in the layout on every page. */
export async function openInterventionCount(): Promise<number> {
  const [r] = await q(`select count(*)::int as n from interventions where state <> 'approved'`);
  return Number(r?.n ?? 0);
}
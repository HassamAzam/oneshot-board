/**
 * What each review gate is, and who can answer it.
 *
 * The role is derived from the gate rather than stored: it is a property of the
 * question, not of a particular run, and deriving it keeps one definition instead of
 * a column that can drift out of step with the pipeline.
 */
export type Role = 'dev' | 'qa';

export const GATES = {
  plan: {
    label: 'Plan',
    role: 'dev' as Role,
    asks: 'Is this the right approach, before any code is written?',
  },
  review: {
    label: 'Code review',
    role: 'dev' as Role,
    asks: 'Are the findings real, and is anything missing?',
  },
  testcases: {
    label: 'Test cases',
    role: 'qa' as Role,
    asks: 'Do these cases actually cover the ticket? They are the oracle for verify and QA.',
  },
  merge: {
    label: 'Merge',
    role: 'dev' as Role,
    asks: 'A person merges this MR — Oneshot never merges a gated run itself.',
  },
} as const;

export const ROLE = {
  dev: { label: 'Dev', hint: 'a developer answers this' },
  qa: { label: 'QA', hint: 'QA answers this' },
} as const;

export const gateInfo = (gate: string) =>
  GATES[gate as keyof typeof GATES] ?? { label: gate, role: 'dev' as Role, asks: '' };

export const STATE = {
  waiting: { pill: 's-warn', text: 'answer is owed' },
  pending: { pill: 's-muted', text: 'not asked yet' },
  approved: { pill: 's-ok', text: 'answered' },
} as const;

export const stateInfo = (state: string) =>
  STATE[state as keyof typeof STATE] ?? { pill: 's-muted' as const, text: state };

import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // users_with_unusable_password counts rows whose password_hash is not in scrypt form —
    // i.e. someone wrote a plaintext password into the column. Those accounts can never sign
    // in, and without this the only symptom is a login that silently always fails.
    const [r] = await q(`select now() as now,
        (select count(*) from sessions)  as sessions,
        (select max(last_seen) from operators) as last_seen,
        (select count(*) from users)     as users,
        (select count(*) from users where password_hash not like 'scrypt$%') as users_with_unusable_password,
        (select count(*) from operators) as operators,
        -- Desks that have reported in the last hour. A count only: this route is public,
        -- so it says how many are shipping, never who they are.
        (select count(*) from operators where last_seen > now() - interval '1 hour') as operators_active`);
    const hint = Number(r.users) === 0
      ? 'no accounts yet — run: npm run user:add -- <username>'
      : Number(r.users_with_unusable_password) > 0
        ? `${r.users_with_unusable_password} account(s) have a plaintext password instead of a hash and can never sign in — re-run: npm run user:add -- <username>`
        : undefined;
    return NextResponse.json({ ok: true, ...r, ...(hint ? { hint } : {}) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

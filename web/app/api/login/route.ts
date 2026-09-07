import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { COOKIE, signSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Only same-origin paths may be a post-login destination. */
const safeNext = (v: string) => (v.startsWith('/') && !v.startsWith('//') ? v : '/');

export async function POST(req: NextRequest) {
  const secret = process.env.SESSION_SECRET ?? '';
  if (!secret) return NextResponse.json({ error: 'SESSION_SECRET is not configured on the server' }, { status: 500 });

  const form = await req.formData();
  const username = String(form.get('username') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? '/'));

  const fail = async () => {
    await new Promise((r) => setTimeout(r, 400));
    const url = new URL('/login', req.url);
    url.searchParams.set('error', '1');
    if (next !== '/') url.searchParams.set('next', next);
    return NextResponse.redirect(url, 303);
  };
  if (!username || !password) return fail();

  const [user] = await q<{ username: string; password_hash: string }>('select username, password_hash from users where username = $1', [username]);
  if (!user || !(await verifyPassword(password, user.password_hash))) return fail();

  await q('update users set last_login_at = now() where username = $1', [username]);
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(COOKIE, await signSession(secret, username), {
    httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', path: '/', maxAge: 7 * 86_400,
  });
  return res;
}

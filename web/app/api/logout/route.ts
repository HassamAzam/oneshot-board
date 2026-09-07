import { NextRequest, NextResponse } from 'next/server';
import { COOKIE } from '@/lib/session';
import { browserOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', browserOrigin(req)), 303);
  res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}

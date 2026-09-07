import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, verifySession } from '@/lib/session';

/**
 * Every page needs a valid session cookie; /login, the ingest route (bearer token) and
 * /api/health are open. With SESSION_SECRET unset the board runs open — local dev only.
 */
export async function middleware(req: NextRequest) {
  const secret = process.env.SESSION_SECRET ?? '';
  if (!secret) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  const session = await verifySession(secret, req.cookies.get(COOKIE)?.value);
  if (pathname === '/login') return session ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  if (session) return NextResponse.next();
  const url = new URL('/login', req.url);
  if (pathname !== '/') url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api/ingest|api/health|api/login|api/logout|api/retention|_next/static|_next/image|favicon.ico).*)'],
};

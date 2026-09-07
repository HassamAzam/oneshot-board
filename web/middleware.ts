import { NextRequest, NextResponse } from 'next/server';

/**
 * HTTP Basic auth for the dashboard. The ingest and health routes use their own bearer token.
 * With DASHBOARD_USER/DASHBOARD_PASSWORD unset the board runs open — fine for localhost, not for Vercel.
 */
export function middleware(req: NextRequest) {
  const user = process.env.DASHBOARD_USER ?? '';
  const pass = process.env.DASHBOARD_PASSWORD ?? '';
  if (!user && !pass) return NextResponse.next();

  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(':');
      const u = i < 0 ? decoded : decoded.slice(0, i);
      const p = i < 0 ? '' : decoded.slice(i + 1);
      if (u === user && p === pass) return NextResponse.next();
    } catch { /* fall through */ }
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Oneshot Board", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!api/ingest|api/health|_next/static|_next/image|favicon.ico).*)'],
};

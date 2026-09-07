import type { NextRequest } from 'next/server';

/**
 * The origin the browser actually used. `req.url` is normalised to the server's own
 * hostname, which differs from the Host header on localhost vs 127.0.0.1 and behind a
 * proxy — a cookie set for one and a redirect to the other logs nobody in.
 */
export function browserOrigin(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || req.nextUrl.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host')?.split(',')[0].trim() || req.headers.get('host') || req.nextUrl.host;
  return `${proto}://${host}`;
}
export const isHttps = (req: NextRequest) => browserOrigin(req).startsWith('https://');

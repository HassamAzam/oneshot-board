/**
 * Session cookie: HMAC-SHA256 over a small JSON payload, using only Web Crypto so the
 * same code runs in the edge middleware and in Node route handlers.
 */
export const COOKIE = 'osb_session';
const enc = new TextEncoder();

function toB64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(secret: string, username: string, days = 7): Promise<string> {
  const payload = toB64u(enc.encode(JSON.stringify({ u: username, exp: Date.now() + days * 86_400_000 })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(payload)));
  return `${payload}.${toB64u(sig)}`;
}

export async function verifySession(secret: string, token: string | undefined): Promise<{ u: string } | null> {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64u(sig), enc.encode(payload));
    if (!ok) return null;
    const d = JSON.parse(new TextDecoder().decode(fromB64u(payload))) as { u?: unknown; exp?: unknown };
    if (typeof d.u !== 'string' || typeof d.exp !== 'number' || d.exp < Date.now()) return null;
    return { u: d.u };
  } catch {
    return null;
  }
}

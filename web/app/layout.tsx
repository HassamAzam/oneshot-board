import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { COOKIE, verifySession } from '@/lib/session';
import { safe } from '@/lib/db';
import { openInterventionCount } from '@/lib/queries';
import ThemeToggle from '@/components/ThemeToggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'Oneshot Board',
  description: 'Every session, agent, skill and tool call across the Oneshot pipeline.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const secret = process.env.SESSION_SECRET ?? '';
  const session = secret ? await verifySession(secret, (await cookies()).get(COOKIE)?.value) : null;
  // A badge is not worth a broken page: a database that is down shows no number.
  const { data: todo } = (!secret || session) ? await safe(openInterventionCount) : { data: 0 };
  return (
    // The inline script below sets data-theme before hydration; tell React that attribute diff is expected.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@600;700&display=swap"
        />
        {/* Apply the saved theme before first paint so the toggle never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('ob-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}` }} />
      </head>
      <body>
        <nav className="nav">
          <div className="nav-in">
            <Link href="/" className="brand"><span className="dot" aria-hidden="true" />Oneshot Board</Link>
            {!secret || session ? (
              <div className="nav-links">
                <Link href="/">Fleet</Link>
                <Link href="/tickets">Tickets</Link>
                <Link href="/interventions">Interventions{todo ? <span className="badge">{todo}</span> : null}</Link>
                <Link href="/agents">Agents</Link>
                <Link href="/skills">Skills</Link>
              </div>
            ) : null}
            <div className="nav-right"><ThemeToggle />{session ? <><span>{session.u}</span><form className="signout" method="post" action="/api/logout"><button type="submit">sign out</button></form></> : null}</div>
          </div>
        </nav>
        <main className="main">{children}</main>
        <footer className="foot">oneshot-board · collector posts every 60s · sessions replace, children only ever add</footer>
      </body>
    </html>
  );
}

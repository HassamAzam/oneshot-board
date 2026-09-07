import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Oneshot Board',
  description: 'Every session, agent, skill and tool call across the Oneshot pipeline.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@600;700&display=swap"
        />
      </head>
      <body>
        <nav className="nav">
          <div className="nav-in">
            <Link href="/" className="brand"><span className="dot" aria-hidden="true" />Oneshot Board</Link>
            <div className="nav-links">
              <Link href="/">Fleet</Link>
              <Link href="/tickets">Tickets</Link>
              <Link href="/agents">Agents</Link>
              <Link href="/skills">Skills</Link>
            </div>
            <div className="nav-right" />
          </div>
        </nav>
        <main className="main">{children}</main>
        <footer className="foot">oneshot-board · collector posts every 60s · sessions replace, children only ever add</footer>
      </body>
    </html>
  );
}

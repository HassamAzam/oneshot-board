'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/**
 * Flips an explicit `data-theme` on <html> and remembers it. The inline bootstrap in
 * the layout applies the saved choice before paint; this only reflects and changes it,
 * so the label stays blank until mounted rather than guessing and flickering.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') setTheme(attr);
    else setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('ob-theme', next); } catch { /* private mode */ }
    setTheme(next);
  };

  const dark = theme === 'dark';
  return (
    <button className="theme-btn" type="button" onClick={toggle}
      aria-label="Toggle light or dark theme" suppressHydrationWarning>
      <span className="theme-ico" aria-hidden="true">{theme ? (dark ? '☾' : '☀') : '◐'}</span>
      <span suppressHydrationWarning>{theme ? (dark ? 'Dark' : 'Light') : 'Theme'}</span>
    </button>
  );
}

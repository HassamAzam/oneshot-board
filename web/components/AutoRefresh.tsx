'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Re-fetches the server-rendered page on an interval while the tab is visible. */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        router.refresh();
        setTick((t) => t + 1);
      }
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <span className="live-ind" title={`Refreshes every ${seconds}s (${tick} so far)`}>
      <i aria-hidden="true" /> live · {seconds}s
    </span>
  );
}

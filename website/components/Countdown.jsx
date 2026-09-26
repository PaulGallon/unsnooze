'use client';

import { useEffect, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');

// Live countdown to the next 03:00 local — the reset the whole page is
// waiting for. Renders a placeholder on the server (the time is the
// visitor's, not the build machine's) and starts ticking after hydration.
export default function Countdown() {
  const [s, setS] = useState(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const t = new Date(now); t.setHours(3, 0, 0, 0);
      if (t <= now) t.setDate(t.getDate() + 1);
      setS(Math.floor((t - now) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (s === null) return <span className="strip__v warm">--:--:--</span>;
  const colon = <span className="colon">:</span>;
  return (
    <span className="strip__v warm">
      {pad(Math.floor(s / 3600))}{colon}{pad(Math.floor(s / 60) % 60)}{colon}{pad(s % 60)}
    </span>
  );
}

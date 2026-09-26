'use client';

import { useEffect, useRef } from 'react';

// The page is one night: scroll position maps to the nav's clock readout —
// 23:58 at the top, 07:22 at the bottom — and to the amber progress hairline
// along the nav's bottom edge, ticked at each phase boundary.
const START = 23 * 60 + 58;
const SPAN = 24 * 60 + 7 * 60 + 22 - START; // minutes from 23:58 to 07:22
const PHASES = [[0.1, 'the wall'], [0.26, 'the ledger'], [0.62, 'the wait'], [0.8, 'the wake'], [0.92, 'verified'], [1.01, 'the morning']];
const TICKS = PHASES.slice(0, -1).map(([lim]) => lim);
const pad = (n) => String(n).padStart(2, '0');

export default function NightClock() {
  const ro = useRef(null), g = useRef(null), t = useRef(null), ph = useRef(null), bar = useRef(null), b = useRef(null);

  useEffect(() => {
    const ticks = [...bar.current.querySelectorAll('i')];
    let last = '';
    const frame = () => {
      const y = scrollY, max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const p = Math.min(1, Math.max(0, y / max));
      const mins = Math.round(START + p * SPAN) % 1440;
      const txt = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
      if (txt !== last) {
        last = txt;
        t.current.textContent = txt;
        ph.current.textContent = PHASES.find(([l]) => p < l)[1];
        const dawn = p > 0.62;
        ro.current.classList.toggle('dawn-on', dawn);
        g.current.textContent = dawn ? '☀' : '☾';
        ticks.forEach((i, n) => i.classList.toggle('passed', p >= TICKS[n]));
      }
      b.current.style.transform = `scaleX(${p.toFixed(4)})`;
    };
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; frame(); });
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    const obs = new ResizeObserver(onScroll);
    obs.observe(document.body);
    frame();
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      obs.disconnect();
    };
  }, []);

  return (
    <>
      <div className="readout" ref={ro} aria-hidden="true">
        <span className="t"><span className="g" ref={g}>☾</span><span ref={t}>23:58</span></span>
        <span className="ph" ref={ph}>the wall</span>
      </div>
      <div className="bar" ref={bar} aria-hidden="true">
        {TICKS.map((lim) => <i key={lim} style={{ left: `${lim * 100}%` }} />)}
        <b ref={b} />
      </div>
    </>
  );
}

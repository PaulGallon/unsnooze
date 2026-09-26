'use client';

import { useEffect, useRef } from 'react';

const TIMES = ['23:58', '03:00', '07:22'];

// The timeline's big sticky clock: whichever stop crosses 55% of the viewport
// lights its timestamp (data-g on each .stop picks the group) and names its
// phase underneath.
export default function NightDial() {
  const dial = useRef(null), phase = useRef(null);

  useEffect(() => {
    const spans = [...dial.current.querySelectorAll('span[data-g]')];
    const stops = [...dial.current.closest('.night').querySelectorAll('.stop')];
    let active = null;
    const sync = () => {
      const line = innerHeight * 0.55;
      let cur = stops[0];
      for (const st of stops) if (st.getBoundingClientRect().top < line) cur = st;
      if (cur === active) return;
      active = cur;
      spans.forEach((s) => s.classList.toggle('on', s.dataset.g === cur.dataset.g));
      phase.current.textContent = cur.dataset.phase;
    };
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; sync(); });
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    sync();
    return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); };
  }, []);

  return (
    <div className="night__clock" ref={dial} aria-hidden="true">
      {TIMES.map((t, i) => <span key={t} data-g={i} className={i === 0 ? 'on' : undefined}>{t}</span>)}
      <div className="phase" ref={phase}>the wall</div>
    </div>
  );
}

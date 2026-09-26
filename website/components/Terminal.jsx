'use client';

import { useEffect, useRef } from 'react';

const SCRIPT = [
  { cls: 't-cmd', text: 'claude', pause: 700 },
  { cls: 't-out', text: '… refactoring the payment module …', pause: 900 },
  { cls: 't-limit', text: "You've hit your usage limit · resets 3am", pause: 500 },
  { cls: 't-us', text: 'unsnooze  recorded claude session f3a1 · waking at 3:00 am', pause: 1000 },
  { cls: 't-cmd', text: 'codex', pause: 600 },
  { cls: 't-limit', text: "■ You've hit your usage limit. Try again at 3:00 AM.", pause: 500 },
  { cls: 't-us', text: 'unsnooze  recorded codex session 8c42 · waking at 3:00 am', pause: 1100 },
  { cls: 't-zzz', text: 'z z z', pause: 1800 },
  { cls: 't-us', text: 'unsnooze  03:00 — limit reset', pause: 500, dawn: true },
  { cls: 't-ok', text: '✓ claude f3a1 resumed · verified', pause: 550 },
  { cls: 't-ok', text: '✓ codex 8c42 resumed · verified', pause: 900 },
  { cls: 't-morning', text: 'good morning — the work is done.', pause: 5200 },
];

// The cinema band: the detect → wait → wake cycle, typed live, full-bleed.
// Starts when a quarter of it is on screen; the band warms at the 03:00 line.
// Imperative DOM writes keep the per-character loop out of React's render.
export function LiveDemo() {
  const section = useRef(null), body = useRef(null);

  useEffect(() => {
    const demo = body.current, cinema = section.current;
    demo.textContent = '';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const l of SCRIPT) {
        const el = document.createElement('span');
        el.className = `ln ${l.cls}`;
        el.textContent = l.text;
        demo.appendChild(el);
      }
      cinema.classList.add('dawnlit');
      return undefined;
    }

    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const typeLine = (i) => {
      if (i >= SCRIPT.length) {
        later(() => { demo.textContent = ''; cinema.classList.remove('dawnlit'); typeLine(0); }, 400);
        return;
      }
      const l = SCRIPT[i];
      const el = document.createElement('span');
      el.className = `ln ${l.cls}`;
      demo.appendChild(el);
      el.appendChild(cursor);
      if (l.dawn) cinema.classList.add('dawnlit');
      const typed = l.cls === 't-cmd';
      let pos = 0;
      const step = () => {
        if (pos < l.text.length) { el.insertBefore(document.createTextNode(l.text[pos++]), cursor); later(step, typed ? 55 : 6); }
        else later(() => typeLine(i + 1), l.pause);
      };
      step();
    };
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); typeLine(0); }
    }, { threshold: 0.25 });
    io.observe(cinema);
    return () => { io.disconnect(); timers.forEach(clearTimeout); };
  }, []);

  return (
    <section className="cinema" ref={section} aria-label="Terminal demo: unsnooze detects two limit-stopped sessions and wakes both at the reset time">
      <div className="cinema__bar"><span>tmux · unsnooze</span><span className="rec"><i className="led hot" aria-hidden="true" />one night, replayed</span></div>
      <div className="cinema__screen">
        <div className="cinema__glow" aria-hidden="true" />
        <div className="cinema__body" ref={body} />
      </div>
    </section>
  );
}

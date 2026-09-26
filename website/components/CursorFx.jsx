'use client';

import { useEffect } from 'react';

const lerp = (a, b, t) => a + (b - a) * t;
const LINKY = 'a, button, summary, [role="tab"], label, select';

// Two pointer effects, mouse/trackpad only, and neither under reduced motion:
//  · caret — the native cursor is replaced by an amber ▋ that always blinks,
//    turning into ❯ over anything clickable (inputs keep the native cursor);
//  · lantern — a faint warm pool of light trails the pointer and brightens the
//    stars inside it; on the home page it fades out as dawn arrives.
// Everything is created here, so nothing renders on the server or on touch.
export default function CursorFx() {
  useEffect(() => {
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return undefined;

    const root = document.documentElement;
    const lantern = document.createElement('div');
    lantern.className = 'fx-lantern';
    const cur = document.createElement('div');
    cur.className = 'fx-cursor';
    document.body.append(lantern, cur);
    root.classList.add('fx-caret');

    const homeSky = !!document.querySelector('.celestial'); // dawn fade only where there is a dawn
    const P = { x: innerWidth / 2, y: innerHeight / 3, in: false };
    const L = { x: P.x, y: P.y, init: false }; // smoothed follower
    let starEls = [...document.querySelectorAll('#stars span')];
    let starRects = [], rectsAt = -1;
    const readStars = () => {
      starRects = starEls.map((el) => { const r = el.getBoundingClientRect(); return { el, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      rectsAt = scrollY;
    };
    const progress = () => scrollY / Math.max(1, root.scrollHeight - innerHeight);

    let raf = 0;
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    function tick() {
      raf = 0;
      L.x = lerp(L.x, P.x, 0.18); L.y = lerp(L.y, P.y, 0.18);
      const busy = Math.hypot(P.x - L.x, P.y - L.y) > 0.5;
      const night = homeSky ? Math.max(0, 1 - Math.max(0, progress() - 0.72) / 0.22) : 1;

      lantern.style.opacity = P.in ? (0.8 * night).toFixed(3) : '0';
      lantern.style.transform = `translate3d(${L.x.toFixed(1)}px, ${L.y.toFixed(1)}px, 0)`;
      if (P.in && rectsAt !== scrollY) readStars();
      starRects.forEach((s) => s.el.classList.toggle('lit', P.in && night > 0.1 && Math.hypot(s.x - L.x, s.y - L.y) < 110));

      cur.style.transform = `translate3d(${P.x}px, ${P.y}px, 0)`;
      cur.style.opacity = P.in ? '1' : '0';
      if (busy) kick();
    }

    const move = (e) => {
      if (e.pointerType !== 'mouse') return;
      P.x = e.clientX; P.y = e.clientY; P.in = true;
      if (!L.init) { L.x = P.x; L.y = P.y; L.init = true; }
      cur.classList.toggle('link', !!e.target.closest?.(LINKY));
      kick();
    };
    const leave = () => { P.in = false; kick(); };
    const scroll = () => { rectsAt = -1; kick(); };
    const resize = () => { starEls = [...document.querySelectorAll('#stars span')]; rectsAt = -1; kick(); };
    addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerleave', leave);
    addEventListener('scroll', scroll, { passive: true });
    addEventListener('resize', resize);

    return () => {
      removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', leave);
      removeEventListener('scroll', scroll);
      removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      root.classList.remove('fx-caret');
      lantern.remove(); cur.remove();
    };
  }, []);
  return null;
}

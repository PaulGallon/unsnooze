'use client';

import { useEffect } from 'react';

// Scroll reveals, one observer for the whole page. Sections mark themselves
// with `.rv` (optionally `style={{ '--d': '100ms' }}` for a stagger) in their
// server markup; CSS hides `.js .rv` until this adds `.in`. Reduced motion and
// no-IntersectionObserver both reveal everything at once.
export default function Reveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.rv');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return undefined;
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

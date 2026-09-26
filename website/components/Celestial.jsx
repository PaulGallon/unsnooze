'use client';

import { useEffect, useRef } from 'react';
import Stars from './Stars.jsx';

const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const smooth = (t) => t * t * (3 - 2 * t);
const DOCK = 0.93; // scroll progress where the rising sun starts to settle

// The home page's sky, driven by scroll: stars that drift and go out, the
// dawn wash rising from below, the hero bloom, and one body that crosses the
// whole page — a crescent moon in the hero that sets down the right edge,
// slips below the fold for the darkest hours, and comes back up the middle as
// the sun, finally settling half-set on the footer's own horizon line
// (#sun-anchor), clear of the sign-off wordmark. Every frame is imperative
// style writes — nothing here goes through React state.
export default function Celestial() {
  const refs = {
    dawn: useRef(null), bloom: useRef(null), cel: useRef(null), disc: useRef(null),
    shade: useRef(null), sunFace: useRef(null), glowMoon: useRef(null), glowSun: useRef(null),
  };

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const { dawn, bloom, cel, disc, shade, sunFace, glowMoon, glowSun } =
      Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, r.current]));
    const starsEl = document.getElementById('stars');
    const footerEl = document.querySelector('footer.site-foot');
    const anchor = document.getElementById('sun-anchor');

    // how far the sun has landed: 0 while the page end is a screen or more
    // away, 1 when the page bottom is the viewport bottom
    const landing = (p, remaining) => {
      if (p < 0.6) return 0;
      return smooth(1 - Math.min(1, Math.max(0, remaining / (innerHeight * 0.95))));
    };

    const place = (p, t) => {
      const vw = innerWidth, vh = innerHeight, narrow = vw <= 640;
      const base = narrow ? 118 : 230; // disc box, px — large in the hero
      const edge = narrow ? 0.06 : 0;
      const k = p < 0.5 ? lerp(1, 0.62, seg(p, 0, 0.5)) // shrinks as it sets…
        : p < 0.65 ? lerp(0.62, 0.72, seg(p, 0.5, 0.65))
          : lerp(0.72, 0.9, seg(p, 0.65, DOCK)); // …swells again as the sun
      // …and settles, half-set, on its own horizon above the footer
      const landSize = narrow ? Math.min(vw * 0.36, 150) : Math.min(vw * 0.2, 280);
      const size = lerp(base * k, landSize, t);
      const B = Math.max(base, size);
      let cx; let cy;
      if (p < 0.45) { cx = (lerp(0.8, 0.86, seg(p, 0, 0.45)) + edge) * vw; cy = lerp(narrow ? 0.16 : 0.3, 0.72, seg(p, 0, 0.45)) * vh; }
      else if (p < 0.55) { cx = (lerp(0.86, 0.88, seg(p, 0.45, 0.55)) + edge) * vw; cy = lerp(0.72, 1.2, seg(p, 0.45, 0.55)) * vh; }
      else if (p < 0.62) { cx = lerp(0.88 + edge, 0.5, seg(p, 0.55, 0.62)) * vw; cy = 1.2 * vh; }
      else { cx = 0.5 * vw; cy = lerp(1.2, 0.34, seg(p, 0.62, DOCK)) * vh; }

      let op = p < 0.45 ? lerp(1, 0.5, seg(p, 0.03, 0.12)) : p < 0.55 ? 0.5 : p < 0.65 ? lerp(0.5, 1, seg(p, 0.55, 0.65)) : 1;
      if (narrow) op *= p < 0.08 ? 1 : lerp(0.5, 1, t);
      else if (p >= 0.55) op *= lerp(0.7, 1, t);

      const r = size / 2, s = size / B;
      let center = cy, clip = 0, hbLocal = null;
      if (t > 0 && anchor) {
        // Land: glide to the anchor — half-set on the footer horizon.
        const rect = anchor.getBoundingClientRect();
        cx = lerp(cx, rect.left, t);
        center = lerp(cy, rect.bottom, t);
        clip = Math.min(size, Math.max(0, center + r - rect.bottom));
        hbLocal = B - (rect.bottom - (center - r)) / s;
      }
      cel.style.width = cel.style.height = `${B.toFixed(1)}px`;
      cel.style.opacity = op.toFixed(3);
      cel.style.transform = `translate3d(${(cx - B / 2).toFixed(1)}px, ${(center - B / 2).toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
      const lb = B / 2, lc = clip / s, lrb = clip > 0 ? 0 : lb;
      disc.style.clipPath = `inset(0 0 ${lc.toFixed(1)}px 0 round ${lb}px ${lb}px ${lrb.toFixed(1)}px ${lrb.toFixed(1)}px)`;
      cel.style.clipPath = hbLocal === null ? 'none' : `inset(-999px -999px ${hbLocal.toFixed(1)}px -999px)`;
      shade.style.transform = `translateX(${(lerp(0.3, 1.05, seg(p, 0, 0.55)) * 100).toFixed(1)}%)`;
      shade.style.opacity = (1 - seg(p, 0.5, 0.62)).toFixed(3);
      sunFace.style.opacity = seg(p, 0.45, 0.8).toFixed(3);
      glowMoon.style.opacity = (p < 0.5 ? lerp(1, 0.7, seg(p, 0, 0.5)) : lerp(0.7, 0, seg(p, 0.5, 0.78))).toFixed(3);
      glowSun.style.opacity = (p < 0.9 ? lerp(0, 0.85, seg(p, 0.62, 0.9)) : lerp(0.85, 1, t)).toFixed(3);
      footerEl?.style.setProperty('--sun', Math.pow(t, 1.3).toFixed(3));
    };

    const frame = () => {
      const y = scrollY, max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const p = Math.min(1, Math.max(0, y / max));
      if (starsEl) starsEl.style.opacity = (p < 0.7 ? lerp(1, 0.8, p / 0.7) : lerp(0.8, 0, seg(p, 0.7, 0.95))).toFixed(3);
      if (!reduced) {
        if (starsEl) starsEl.style.transform = `translate3d(0, ${(-p * 14).toFixed(2)}vh, 0)`;
        dawn.style.opacity = (p < 0.5 ? lerp(0, 0.05, p / 0.5) : p < 0.85 ? lerp(0.05, 0.3, seg(p, 0.5, 0.85)) : lerp(0.3, 1, seg(p, 0.85, 1))).toFixed(3);
      }
      bloom.style.opacity = (1 - seg(y, 0, innerHeight * 0.9)).toFixed(3);
      if (!reduced) place(p, landing(p, max - y));
    };

    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; frame(); });
    };
    // The anchor can move without a scroll event — mobile URL-bar collapse,
    // late layout (fonts, the sign-off crop) — so re-measure on all of them.
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    visualViewport?.addEventListener('resize', onScroll);
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);
    document.fonts?.ready.then(onScroll);
    frame();
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      visualViewport?.removeEventListener('resize', onScroll);
      ro.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Stars />
      <div className="shooting" aria-hidden="true" />
      <div className="dawn" ref={refs.dawn} aria-hidden="true" />
      <div className="bloom" ref={refs.bloom} aria-hidden="true" />
      <div className="celestial" ref={refs.cel} aria-hidden="true">
        <div className="cel-inner">
          <div className="cel-glow cel-glow--moon" ref={refs.glowMoon} />
          <div className="cel-glow cel-glow--sun" ref={refs.glowSun} />
          <div className="cel-disc" ref={refs.disc}>
            <div className="cel-moon" />
            <div className="cel-sun" ref={refs.sunFace} />
            <div className="cel-shade" ref={refs.shade} />
          </div>
        </div>
      </div>
    </>
  );
}

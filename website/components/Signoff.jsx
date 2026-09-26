'use client';

import { useEffect, useRef } from 'react';

// The giant "❯ unsnooze" sign-off, cropped by the page's bottom edge so about
// 70% of the x-height shows — measured from the display font's real metrics
// rather than guessed, so the crop holds whatever the font renders as.
export default function Signoff({ small = false }) {
  const box = useRef(null), glyph = useRef(null), word = useRef(null);

  useEffect(() => {
    const measure = document.createElement('canvas').getContext('2d');
    const fit = () => {
      const w = word.current;
      if (!w) return;
      const cs = getComputedStyle(w), fs = parseFloat(cs.fontSize);
      measure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = measure.measureText('unsnooze');
      if (!m.fontBoundingBoxAscent) return;
      const half = (fs - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2; // line-height: 1
      const inkTop = half + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent;
      const pad = fs * 0.03;
      w.style.marginTop = `${(pad - inkTop).toFixed(1)}px`;
      box.current.style.height = `${(pad + m.actualBoundingBoxAscent * 0.72).toFixed(1)}px`;
      glyph.current.style.marginTop = `${(pad + m.actualBoundingBoxAscent * 0.12).toFixed(1)}px`;
    };
    fit();
    document.fonts?.ready.then(fit);
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);

  return (
    <div className={small ? 'signoff signoff--small' : 'signoff'} ref={box} aria-hidden="true">
      <span className="signoff__glyph" ref={glyph}>❯</span>
      <span className="signoff__word" ref={word} data-text="unsnooze">unsnooze</span>
    </div>
  );
}

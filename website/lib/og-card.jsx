import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

// Shared frame for every route's Open Graph card: the site's night sky with
// dawn rising from the bottom edge, an amber accent. Satori supports only
// flexbox and a small CSS subset, and wants hex/rgba colours — these are the
// sRGB equivalents of the OKLCH tokens in globals.css. The chevron is drawn,
// not typed, because the bundled font has no ❯ glyph.
const NIGHT = '#050713';
const INK = '#f3eee6';
const INK_2 = '#b7beca';
const INK_3 = '#8a93a0';
const AMBER = '#ffa733';

export function ogCard({ headline, sub }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          backgroundColor: NIGHT,
          backgroundImage: 'radial-gradient(ellipse 85% 60% at 50% 125%, rgba(251,124,0,0.42), rgba(249,111,112,0.12) 55%, rgba(5,7,19,0) 78%)',
          color: INK,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <svg width="48" height="48" viewBox="0 0 64 64">
              <path d="M18 12 L44 32 L18 52" fill="none" stroke={AMBER} strokeWidth="10"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>unsnooze</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: INK_3, letterSpacing: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 28, backgroundColor: '#e2ecf7', boxShadow: 'inset -9px -4px 0 0 #050713' }} />
            23:58 → 07:22
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3, maxWidth: 1020 }}>
            {headline}
          </div>
          <div style={{ width: 120, height: 4, borderRadius: 4, backgroundColor: AMBER }} />
          <div style={{ fontSize: 30, lineHeight: 1.35, color: INK_2, maxWidth: 980 }}>{sub}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}

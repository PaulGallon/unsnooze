'use client';

import { useEffect, useState } from 'react';
import NightClock from './NightClock.jsx';

// Flush top bar: brand · night-clock readout (home only) · links · progress
// hairline. Absolute hrefs — the site lives at the domain root.
export default function SiteNav({ page = 'home' }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 24);
    on();
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);

  const home = page === 'home';
  const cur = (p) => (page === p ? { 'aria-current': 'page', className: 'on' } : {});

  return (
    <header className={`nav${scrolled ? ' scrolled' : ''}${home ? '' : ' nav--sub'}`}>
      <a className="brand" href={home ? '#top' : '/'}>
        <span className="p">❯</span>unsnooze <small>ONE NIGHT</small>
      </a>
      {home && <NightClock />}
      <nav className="nav-links" aria-label="Main">
        {home ? (
          <>
            <a className="sec" href="#why">why</a>
            <a className="sec" href="#night">how it works</a>
            <a className="sec" href="#agents">agents</a>
            <a className="sec" href="#terminals">terminals</a>
            <a className="sec" href="#contract">security</a>
          </>
        ) : (
          <a className="opt1" href="/">overview</a>
        )}
        <a href="/docs/" {...cur('docs')}>docs</a>
        <a href="/changelog/" {...cur('changelog')} className={`opt2${page === 'changelog' ? ' on' : ''}`}>changelog</a>
        <a href="/feedback/" {...cur('feedback')} className={`opt2${page === 'feedback' ? ' on' : ''}`}>feedback</a>
        <a className="gh" href="https://github.com/saaranshM/unsnooze">github</a>
      </nav>
    </header>
  );
}

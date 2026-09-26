import InstallPill from './InstallPill.jsx';
import Signoff from './Signoff.jsx';

export const FOOT_LINKS = [
  ['/docs/', 'docs'],
  ['/changelog/', 'changelog'],
  ['/feedback/', 'feedback'],
  ['https://github.com/saaranshM/unsnooze', 'github'],
  ['https://www.npmjs.com/package/unsnooze', 'npm'],
  ['https://github.com/saaranshM/unsnooze/blob/main/SECURITY.md', 'security'],
  ['https://github.com/saaranshM/unsnooze/issues', 'issues'],
];

// Closing CTA → the horizon the travelling sun sets on (#sun-anchor; a static
// half-sun under reduced motion) → links and colophon → the cropped sign-off
// wordmark. Celestial writes --sun (0→1) onto this footer as the sun lands,
// which lights the horizon line and warms the wordmark.
export default function Footer() {
  return (
    <footer className="site-foot">
      <section className="closing rv" aria-labelledby="closing-h">
        <p className="kicker"><b>07:22</b><span className="tick">·</span>the next morning</p>
        <h2 className="statement" id="closing-h">
          <span className="ln">Good morning.</span>
          <span className="ln">The work is <span className="hl">done</span>.</span>
        </h2>
        <p className="closing__line">One command tonight; every limit-stopped session awake by sunrise.</p>
        <div className="closing__cta">
          <InstallPill />
          <a className="ghost-link" href="/docs/">Read the docs <span aria-hidden="true">→</span></a>
        </div>
      </section>
      <div className="horizon" aria-hidden="true">
        <div className="static-sun" />
        <div id="sun-anchor" />
      </div>
      <div className="foot">
        <div className="foot__row">
          <nav className="foot-links" aria-label="Footer">
            {FOOT_LINKS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <p className="colophon">❯ z z z &nbsp;·&nbsp; MIT © Saaransh Menon</p>
        </div>
      </div>
      <Signoff />
    </footer>
  );
}

import Signoff from './Signoff.jsx';
import { FOOT_LINKS } from './Footer.jsx';

// The subpages' compact ending: links + colophon, then a smaller sign-off.
export default function SubFooter() {
  return (
    <footer className="sub-foot">
      <div className="foot">
        <div className="foot__row">
          <nav className="foot-links" aria-label="Footer">
            <a href="/">overview</a>
            {FOOT_LINKS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <p className="colophon">❯ z z z &nbsp;·&nbsp; MIT © Saaransh Menon</p>
        </div>
      </div>
      <Signoff small />
    </footer>
  );
}

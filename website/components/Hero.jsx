import InstallPill from './InstallPill.jsx';
import Countdown from './Countdown.jsx';
import { LiveDemo } from './Terminal.jsx';

const AGENTS = [
  'Claude Code', 'Codex CLI', 'Grok Build', 'Qwen Code', 'Kimi CLI',
  'OpenCode', 'Antigravity', 'Cursor CLI', 'VS Code extension', 'ChatGPT desktop',
  'Claude desktop', 'tmux', 'Zellij', 'herdr', 'cmux', 'Windows',
];

// Marquee hero → instrument strip → cinema band → credits crawl.
// The h1 is the LCP element: its lines slide up (transform only) and are
// never at opacity 0, so they count as painted on first paint.
export default function Hero({ version }) {
  return (
    <>
      <header className="hero" id="top">
        <div className="static-moon" aria-hidden="true" />
        <div className="hero__inner">
          <p className="eyebrow"><span className="dot" aria-hidden="true" />23:58 <span className="tick">·</span> somewhere in your terminal</p>
          <h1>
            <span className="ln">While you sleep,</span>
            <span className="ln">the work</span>
            <span className="ln"><span className="wake">continues</span>.</span>
            <span className="h1-sub">
              unsnooze auto-resumes Claude Code and Codex when the usage limit resets
            </span>
          </h1>
          <p className="lede">
            When Claude Code, Codex, or any of your AI coding agents hits the 5-hour or
            weekly usage limit, the session just… stops. <strong>unsnooze tracks every
            limit-stopped session across all your projects and resumes it when the limit
            resets, with or without a terminal multiplexer.</strong> Even if your laptop slept
            through it.
          </p>
          <div className="hero__cta">
            <InstallPill />
            <div className="badges">
              {version && <span>v{version}</span>}<span>MIT</span><span>Node ≥ 20.12</span>
              <span>tmux · Zellij · herdr · cmux</span><span>macOS · Linux · Windows</span><span>zero telemetry</span>
            </div>
          </div>
        </div>
      </header>

      <div className="strip" role="group" aria-label="Tonight's ledger">
        <div className="strip__row">
          <div className="strip__cell"><span className="strip__k"><i className="led hot" aria-hidden="true" />limit hit</span><span className="strip__v hot">23:58<small>claude · 5h</small></span></div>
          <div className="strip__cell"><span className="strip__k">to reset · 03:00 local</span><Countdown /></div>
          <div className="strip__cell"><span className="strip__k">sessions</span><span className="strip__v">2<small>snoozed</small></span></div>
          <div className="strip__cell"><span className="strip__k"><i className="led" aria-hidden="true" />daemon</span><span className="strip__v">30s<small>tick · running</small></span></div>
        </div>
      </div>

      <LiveDemo />
      <div className="credits" aria-hidden="true">
        <div className="credits__track">
          {[...AGENTS, ...AGENTS].map((name, i) => <span key={i}>{name}</span>)}
        </div>
      </div>
    </>
  );
}

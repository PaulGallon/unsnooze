const C = ({ children }) => <code className="chip">{children}</code>;

// Ordered by how much of unsnooze each one lights up. headless is last and
// framed as the floor, not a peer — it is what you get when there is no
// multiplexer at all, and it gives up real things.
const TERMINALS = [
  {
    name: 'tmux',
    req: '≥ 3.2',
    href: 'https://github.com/tmux/tmux',
    body: <>The reference backend, and the only one that can push OSC notifications straight
      to the terminal you are actually looking at. Everything else is measured against it.</>,
  },
  {
    name: 'Zellij',
    href: 'https://zellij.dev',
    body: <>Full parity for the whole session lifecycle — detect, resume in place, revive a
      dead pane, reap idle sessions.</>,
  },
  {
    name: 'herdr',
    req: '≥ 0.8.0',
    href: 'https://herdr.dev',
    body: <>Built for running coding agents. A workspace there is the project, so a revival
      opens a tab in the one already on that directory. And since herdr restores saved agent
      panes by itself, unsnooze never restarts a stopped session — that could resume the same
      conversation twice — and revives into a fresh name instead.</>,
  },
  {
    name: 'cmux',
    href: 'https://cmux.dev',
    body: <>Detect, resume and revive all work. It has no joinable named session, so a revival
      opens a fresh workspace and there is no <C>attach:</C> hint to print.</>,
  },
];

export default function Terminals() {
  return (
    <section className="poster" id="terminals">
      <div className="rv head--end">
        <p className="eyebrow">wherever you work</p>
        <h2 className="poster-h">Supported <span className="hl">terminals</span></h2>
        <p className="section-lede">
          Four terminal multiplexers, on macOS, Linux and Windows — and if you have none of
          them, unsnooze still catches and resumes your limit stops.
        </p>
      </div>

      <div className="roster">
        {TERMINALS.map((t) => (
          <div className="roster__row rv" key={t.name}>
            <h3 className="roster__name">
              <a href={t.href} target="_blank" rel="noreferrer">{t.name}</a>
              {t.req && <span className="tag">{t.req}</span>}
            </h3>
            <p>{t.body}</p>
          </div>
        ))}
      </div>

      <div className="exp rv">
        <div className="exp__head">
          <span className="tag exp">no multiplexer</span>
          <span>
            With none installed, unsnooze runs <strong>headless</strong>: it reads limit stops
            from the Claude <C>StopFailure</C> hook and the session transcript instead of a
            pane, and revives into a detached process. That is what makes native Windows,
            bare servers and CI work. You give up the limit-menu answering and the live pane —
            so <C>headless</C> is only ever chosen when nothing else is there, never ahead of
            a real multiplexer. A headless revival that dies is retried with backoff, and its
            own error shows as <C>last error</C> in <C>unsnooze status</C>.
          </span>
        </div>
        <div className="exp__rows">
          <div className="exp__row">
            <code>auto</code>
            <span>Uses the multiplexer you are already inside; failing that, whichever of tmux,
              Zellij or herdr is installed (tmux breaks ties — cmux only when you are inside it
              or pin it); failing that, headless.</span>
          </div>
          <div className="exp__row">
            <code>pin it</code>
            <span><C>unsnooze config set multiplexer tmux|zellij|herdr|cmux|headless</C> —
              and <a href="/docs/#terminals">the full capability table</a> is in the docs.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

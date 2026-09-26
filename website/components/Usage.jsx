const LADDER = [
  {
    title: 'Every figure carries its provenance',
    body: <><code className="chip">(exact)</code> from local data or the opt-in statusline
      shim, <code className="chip">(calibrated from N stops)</code> learned from your own
      recorded limit stops, or <code className="chip">(estimated)</code> while calibrating.
      Never a bare percentage.</>,
  },
  {
    title: 'ETA as a band, not a lie',
    body: <>Time-to-wall is cross-checked against known reset times and shown as a range —
      never a false-precision minute, never a blind now-plus-five-hours.</>,
  },
  {
    title: 'Account-wide, not per-pane',
    body: <>Burn sums all active sessions <em>and</em> subagents — the limit is
      per-account. Idle gaps over 5 minutes are excluded so a quiet hour doesn't hide a
      fast burn.</>,
  },
];

export default function Usage() {
  return (
    <section className="poster" id="usage">
      <div className="rv">
        <p className="eyebrow"><b>20:41</b> <span className="tick">·</span> before the wall</p>
        <h2 className="poster-h">Know the 5-hour limit wall <span className="hl">before you hit it</span></h2>
        <p className="section-lede">
          Recovery is only half the job. <code className="chip">unsnooze usage</code> forecasts
          your burn rate and time-to-limit so you can <code className="chip">/compact</code>,
          pause, or switch models <em>before</em> a stop — see it live in the usage tab of the
          dashboard above, or <code className="chip">--json</code> it into your own tooling.
          The <a href="/docs/commands/#usage">usage forecast documentation</a> covers how each
          figure is derived.
        </p>
      </div>
      <div className="ladder rv">
        {LADDER.map((n) => (
          <div key={n.title}>
            <h3>{n.title}</h3>
            <p>{n.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

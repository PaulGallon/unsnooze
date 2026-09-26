import NightDial from './NightDial.jsx';

const STOPS = [
  {
    mood: 'hot', time: '23:58', title: 'The wall', g: 0, phase: 'the wall',
    body: <>Mid-refactor, the banner lands: <em>“You've hit your usage limit · resets
      3am.”</em> The session stops. Without unsnooze, this is where the night ends.</>,
  },
  {
    mood: '', time: '23:58:01', title: 'The ledger', g: 0, phase: 'the ledger',
    body: <>Claude's <code className="chip">StopFailure</code> hook — or a pane scrape, or the session
      files GUI surfaces write — records the stop in <code className="chip">~/.unsnooze/state.json</code>:
      agent, session id, working directory, pane, reset time. The reset is parsed from the
      banner text, DST-safe. Unparseable banners are never guessed at — unsnooze re-probes
      until a real time appears.</>,
  },
  {
    mood: '', time: '23:59 → 02:59', title: 'The wait', g: 0, phase: 'the wait',
    body: <>A singleton daemon checks wall-clock against the target epoch every 30 seconds —
      no long timers to break. A laptop that slept through the reset fires on the next tick.
      A weekly limit is just a bigger epoch.</>,
  },
  {
    mood: 'warm', time: '03:00', title: 'The wake', g: 1, phase: 'the wake',
    body: <>Pane still alive? The resume message is typed in — only after proving the pane is
      yours and your CLI is foreground and idle. Pane gone? A fresh multiplexer pane runs
      <code className="chip">claude --resume &lt;id&gt;</code> — or, with no multiplexer, a
      detached headless process. Either way it's the same session,
      same context, same conversation.</>,
  },
  {
    mood: '', time: '03:00:12', title: 'The verification', g: 1, phase: 'the verification',
    body: <>After every wake, the pane is re-captured. If the limit banner came back — reset
      time misparsed, limit not actually lifted — unsnooze reschedules from the fresh banner,
      capped at five attempts. It never hammers.</>,
  },
  {
    mood: 'awake', time: '07:22', title: 'The morning', g: 2, phase: 'the morning',
    body: <>You wake up; the work didn't stop. <code className="chip">unsnooze status</code> shows
      every session that hit a wall, when it woke, and what it's doing now.</>,
  },
];

export default function Timeline() {
  return (
    <section className="poster" id="night">
      <div className="rv head--end">
        <p className="eyebrow">one night <span className="tick">·</span> how it works</p>
        <h2 className="poster-h">Anatomy of a <span className="hl">night shift</span>, from usage limit to resumed session</h2>
        <p className="section-lede">
          unsnooze is a scheduler that presses your keys — nothing more. It records the
          stop, waits out the reset, and resumes the <em>same</em> session. Here is one
          night, minute by minute.
        </p>
      </div>
      <div className="night">
        <NightDial />
        <ol className="night__stops">
          {STOPS.map((s) => (
            <li key={s.time} className={`stop ${s.mood}`} data-g={s.g} data-phase={s.phase}>
              <time>{s.time}</time>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

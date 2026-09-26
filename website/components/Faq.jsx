import { FAQ } from '../lib/faq-data.jsx';

export default function Faq() {
  return (
    <section className="poster" id="faq">
      <div className="rv">
        <p className="eyebrow">asked at 4am</p>
        <h2 className="poster-h">Questions people <span className="hl">actually ask</span></h2>
      </div>
      <div className="faq rv">
        {FAQ.map(({ q, jsx }) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{jsx}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

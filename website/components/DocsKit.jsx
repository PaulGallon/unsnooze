// Shared building blocks for the docs routes. Extracted when the single
// /docs/ page was split so the five pages stay visually identical.

// A terminal block: a mono caption bar and the output — no fake window chrome.
export function Shell({ title = 'terminal', children }) {
  return (
    <figure className="shell">
      <figcaption>{title}</figcaption>
      <pre>{children}</pre>
    </figure>
  );
}

export const C = ({ children }) => <code className="chip">{children}</code>;

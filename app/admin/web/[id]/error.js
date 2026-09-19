'use client';

export default function CmsEditorError({ reset }) {
  return <section className="admin-content"><h2>Kunne ikke åpne redigeringen</h2><p>Prøv å laste siden på nytt. Ingen endringer er gjort.</p><button className="primary-button" type="button" onClick={reset}>Prøv igjen</button></section>;
}

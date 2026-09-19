'use client';

export default function CmsEditorError({ reset }) {
  return <main className="admin-shell"><section className="admin-content"><h1>Kunne ikke åpne redigeringen</h1><p>Prøv å laste siden på nytt. Ingen endringer er gjort.</p><button className="primary-button" type="button" onClick={reset}>Prøv igjen</button></section></main>;
}

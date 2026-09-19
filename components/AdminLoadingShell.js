export default function AdminLoadingShell({ title = 'Laster administrasjon …' }) {
  return <section className="admin-content admin-loading-content" role="status" aria-label={title} aria-busy="true">
      <div className="admin-loading-card"><span className="admin-loading-line is-heading" /><span className="admin-loading-line" /><span className="admin-loading-line is-short" /></div>
      <div className="admin-loading-card"><span className="admin-loading-line is-heading" /><span className="admin-loading-line" /><span className="admin-loading-line" /><span className="admin-loading-line is-short" /></div>
  </section>;
}

import BrandLogo from '@/components/BrandLogo';

export default function AdminLoadingShell({ title = 'Laster administrasjon …' }) {
  return <main className="admin-shell" aria-busy="true">
    <aside className="admin-sidebar admin-loading-sidebar" aria-hidden="true">
      <div className="admin-sidebar-brand"><BrandLogo variant="stacked" decorative className="admin-sidebar-logo" /><strong>Medlemsservice</strong></div>
      <div className="admin-loading-nav">{Array.from({ length: 7 }, (_, index) => <span key={index} className="admin-loading-line" />)}</div>
    </aside>
    <header className="admin-header">
      <p className="eyebrow">Turufjell Vel</p>
      <h1>{title}</h1>
    </header>
    <section className="admin-content admin-loading-content" role="status" aria-label={title}>
      <div className="admin-loading-card"><span className="admin-loading-line is-heading" /><span className="admin-loading-line" /><span className="admin-loading-line is-short" /></div>
      <div className="admin-loading-card"><span className="admin-loading-line is-heading" /><span className="admin-loading-line" /><span className="admin-loading-line" /><span className="admin-loading-line is-short" /></div>
    </section>
  </main>;
}

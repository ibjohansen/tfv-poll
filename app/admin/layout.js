import SiteHeader from '@/components/SiteHeader';

export default function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <SiteHeader />
      {children}
    </div>
  );
}

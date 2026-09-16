import SiteHeader from '@/components/SiteHeader';
import AdminButtonTooltips from '@/components/AdminButtonTooltips';

export default function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <AdminButtonTooltips />
      <SiteHeader />
      {children}
    </div>
  );
}

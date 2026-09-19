import SiteHeader from '@/components/SiteHeader';
import AdminButtonTooltips from '@/components/AdminButtonTooltips';
import RequestLocaleProvider from '@/components/RequestLocaleProvider';

export default function AdminLayout({ children }) {
  return (
    <RequestLocaleProvider><div className="admin-layout">
      <AdminButtonTooltips />
      <SiteHeader />
      {children}
    </div></RequestLocaleProvider>
  );
}

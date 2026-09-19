import RequestLocaleProvider from '@/components/RequestLocaleProvider';

export default function MemberProfileLayout({ children }) {
  return <RequestLocaleProvider>{children}</RequestLocaleProvider>;
}

import RequestLocaleProvider from '@/components/RequestLocaleProvider';

export default function SurveyLayout({ children }) {
  return <RequestLocaleProvider>{children}</RequestLocaleProvider>;
}

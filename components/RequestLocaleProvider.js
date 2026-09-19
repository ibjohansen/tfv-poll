import LocaleProvider from '@/components/LocaleProvider';
import { getServerI18n } from '@/lib/i18n/server';
import { dictionaries } from '@/locales';

export default async function RequestLocaleProvider({ children }) {
  const { locale, messages } = await getServerI18n();
  return <LocaleProvider locale={locale} messages={messages} dictionaries={dictionaries}>{children}</LocaleProvider>;
}

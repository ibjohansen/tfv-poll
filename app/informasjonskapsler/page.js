import CookieInformation from '@/components/CookieInformation';
import { getDictionary } from '@/locales';
import { DEFAULT_LOCALE } from '@/lib/i18n/config';
import { scopedTranslator } from '@/lib/i18n/translate';

export function generateMetadata() {
  const t = scopedTranslator(getDictionary(DEFAULT_LOCALE), 'general.cookies');
  return { title: `${t('title')} | Turufjell Vel`, description: t('introduction') };
}

export default function CookieInformationPage() {
  return <CookieInformation />;
}

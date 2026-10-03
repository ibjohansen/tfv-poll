import nb from '../../locales/nb/system-email.js';
import en from '../../locales/en/system-email.js';
import { normalizeLocale, DEFAULT_LOCALE } from './config.js';
import { scopedTranslator } from './translate.js';

export const emailDictionaries = { nb, en };
export function getEmailI18n(value) {
  const locale = normalizeLocale(value) || DEFAULT_LOCALE;
  return { locale, formatLocale: locale === 'en' ? 'en-GB' : 'nb-NO', t: scopedTranslator(emailDictionaries[locale]) };
}

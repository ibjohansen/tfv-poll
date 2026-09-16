import 'server-only';
import { cookies, headers } from 'next/headers';
import { getDictionary } from '../../locales/index.js';
import { DEFAULT_LOCALE, LOCALE_COOKIE, localeFromAcceptLanguage, normalizeLocale } from './config.js';
import { scopedTranslator } from './translate.js';

export async function getServerLocale() {
  const requestHeaders = await headers();
  const requested = normalizeLocale(requestHeaders.get('x-tfv-locale'));
  if (requested) return requested;
  const stored = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (stored) return stored;
  return localeFromAcceptLanguage(requestHeaders.get('accept-language')) || DEFAULT_LOCALE;
}

export async function getServerI18n(scope = '') {
  const locale = await getServerLocale();
  const messages = getDictionary(locale);
  return { locale, messages, t: scopedTranslator(messages, scope) };
}

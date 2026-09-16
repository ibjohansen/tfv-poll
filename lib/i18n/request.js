import { getDictionary } from '../../locales/index.js';
import { DEFAULT_LOCALE, LOCALE_COOKIE, localeFromAcceptLanguage, normalizeLocale } from './config.js';
import { scopedTranslator } from './translate.js';

function cookieValue(header, name) {
  for (const part of String(header || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

export function getRequestLocale(request) {
  return normalizeLocale(cookieValue(request?.headers?.get('cookie'), LOCALE_COOKIE))
    || localeFromAcceptLanguage(request?.headers?.get('accept-language')) || DEFAULT_LOCALE;
}

export function getRequestI18n(request, scope = '') {
  const locale = getRequestLocale(request);
  const messages = getDictionary(locale);
  return { locale, messages, t: scopedTranslator(messages, scope) };
}

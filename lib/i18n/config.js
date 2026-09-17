export const DEFAULT_LOCALE = 'nb';
export const SUPPORTED_LOCALES = ['nb', 'en'];
export const LOCALE_COOKIE = 'tfv_locale';

export const FORMAT_LOCALES = { nb: 'nb-NO', en: 'en-GB' };

export function normalizeLocale(value) {
  const locale = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(locale) ? locale : null;
}

export function formatLocale(locale) {
  return FORMAT_LOCALES[normalizeLocale(locale) || DEFAULT_LOCALE];
}

export const DEFAULT_LOCALE = 'nb';
export const SUPPORTED_LOCALES = ['nb', 'en'];
export const LOCALE_COOKIE = 'tfv_locale';

export const FORMAT_LOCALES = { nb: 'nb-NO', en: 'en-GB' };

export function normalizeLocale(value) {
  const locale = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(locale) ? locale : null;
}

export function localeFromAcceptLanguage(value) {
  const preferences = String(value || '').split(',').map((entry, index) => {
    const [tag, ...parameters] = entry.trim().split(';');
    const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
    const q = quality ? Number(quality.trim().slice(2)) : 1;
    return { tag, q: Number.isFinite(q) ? q : 0, index };
  }).filter(({ q }) => q > 0).sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of preferences) {
    const locale = normalizeLocale(tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function formatLocale(locale) {
  return FORMAT_LOCALES[normalizeLocale(locale) || DEFAULT_LOCALE];
}

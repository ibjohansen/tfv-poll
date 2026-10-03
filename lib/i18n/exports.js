import nb from '../../locales/nb/exports.js';
import en from '../../locales/en/exports.js';
import { normalizeLocale, DEFAULT_LOCALE } from './config.js';
import { scopedTranslator } from './translate.js';

export const exportDictionaries = { nb, en };
export function getExportI18n(value) {
  const locale = normalizeLocale(value) || DEFAULT_LOCALE;
  return { locale, t: scopedTranslator(exportDictionaries[locale]) };
}

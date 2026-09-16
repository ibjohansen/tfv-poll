import nb from './nb/index.js';
import en from './en/index.js';
import { DEFAULT_LOCALE, normalizeLocale } from '../lib/i18n/config.js';

const dictionaries = { nb, en };

export function getDictionary(locale) {
  return dictionaries[normalizeLocale(locale) || DEFAULT_LOCALE];
}

export { dictionaries };

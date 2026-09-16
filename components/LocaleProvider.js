'use client';

import { createContext, useContext, useMemo } from 'react';
import { formatLocale } from '@/lib/i18n/config';
import { scopedTranslator } from '@/lib/i18n/translate';

const LocaleContext = createContext(null);

export default function LocaleProvider({ locale, messages, children }) {
  const value = useMemo(() => ({ locale, messages, formatLocale: formatLocale(locale) }), [locale, messages]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(scope = '') {
  const value = useContext(LocaleContext);
  const t = useMemo(() => scopedTranslator(value?.messages || {}, scope), [scope, value?.messages]);
  if (!value) throw new Error('LocaleProvider is missing');
  return { ...value, t };
}

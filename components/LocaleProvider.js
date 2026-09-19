'use client';

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { formatLocale, normalizeLocale } from '@/lib/i18n/config';
import { scopedTranslator } from '@/lib/i18n/translate';

const LocaleContext = createContext(null);
const LOCALE_STORAGE_KEY = 'tfv-locale';
const LOCALE_CHANGE_EVENT = 'tfv-locale-change';

function subscribeToLocale(onStoreChange) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  };
}

function readBrowserLocale() {
  const requested = new URL(window.location.href).searchParams.get('lang');
  if (requested) return normalizeLocale(requested);
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export default function LocaleProvider({ locale, messages, dictionaries, children }) {
  const activeLocale = useSyncExternalStore(
    subscribeToLocale,
    () => readBrowserLocale() || locale,
    () => locale,
  );
  useEffect(() => {
    document.documentElement.lang = activeLocale;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, activeLocale);
    } catch { /* Language still works for this page when storage is unavailable. */ }
  }, [activeLocale]);
  const activeMessages = dictionaries?.[activeLocale] || messages;
  const value = useMemo(() => ({ locale: activeLocale, messages: activeMessages, formatLocale: formatLocale(activeLocale) }), [activeLocale, activeMessages]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function rememberLocale(locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, normalizeLocale(locale) || 'nb');
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  } catch {}
}

export function useI18n(scope = '') {
  const value = useContext(LocaleContext);
  const t = useMemo(() => scopedTranslator(value?.messages || {}, scope), [scope, value?.messages]);
  if (!value) throw new Error('LocaleProvider is missing');
  return { ...value, t };
}

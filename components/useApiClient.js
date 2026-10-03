'use client';

import { useCallback } from 'react';
import { useI18n } from './LocaleProvider';
import { fetchApplication } from '@/lib/browser-http';

export function useApiClient() {
  const { t } = useI18n('general.network');
  return useCallback((path, options) => fetchApplication(path, options, {
    failed: t('failed'), timeout: t('timeout'), invalid: t('invalid'),
  }), [t]);
}

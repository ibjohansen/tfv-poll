'use client';

import { useI18n } from '@/components/LocaleProvider';
import { useState } from 'react';
import CmsPageView from '@/components/CmsPageView';

export default function CmsPreviewFrame({ page }) {
  const { t } = useI18n('cms.preview');
  const [width, setWidth] = useState('desktop');
  return <><div className="cms-preview-widths" role="group" aria-label={t('width')}><button type="button" aria-pressed={width === 'mobile'} onClick={() => setWidth('mobile')}>{t('mobile')}</button><button type="button" aria-pressed={width === 'tablet'} onClick={() => setWidth('tablet')}>{t('tablet')}</button><button type="button" aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')}>{t('desktop')}</button></div><div className={`cms-preview-viewport is-${width}`}><div className="cms-public-main"><CmsPageView page={page} preview /></div></div></>;
}

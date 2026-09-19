'use client';

import { useState } from 'react';
import CmsPageView from '@/components/CmsPageView';

export default function CmsPreviewFrame({ page }) {
  const [width, setWidth] = useState('desktop');
  return <><div className="cms-preview-widths" role="group" aria-label="Forhåndsvisningsbredde"><button type="button" aria-pressed={width === 'mobile'} onClick={() => setWidth('mobile')}>Mobil</button><button type="button" aria-pressed={width === 'tablet'} onClick={() => setWidth('tablet')}>Nettbrett</button><button type="button" aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')}>Desktop</button></div><div className={`cms-preview-viewport is-${width}`}><div className="cms-public-main"><CmsPageView page={page} preview /></div></div></>;
}

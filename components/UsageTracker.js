'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { deviceCategoryForWidth, pageTypeForPath } from '@/lib/usage-metrics';

export default function UsageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSurveyPreview = pathname === '/survey' && searchParams.has('preview');

  useEffect(() => {
    if (isSurveyPreview) return;
    const pageType = pageTypeForPath(pathname);
    if (!pageType || navigator.doNotTrack === '1') return;
    void fetch('/api/usage/pageview', {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageType, deviceCategory: deviceCategoryForWidth(window.innerWidth) }),
    }).catch(() => {});
  }, [isSurveyPreview, pathname]);

  return null;
}

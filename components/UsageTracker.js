'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { deviceCategoryForWidth, pageTypeForPath } from '@/lib/usage-metrics';

export default function UsageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSurveyPreview = pathname === '/survey' && searchParams.has('preview');
  const lastTrackedPath = useRef(null);

  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flushUsage(); };
    window.addEventListener('pagehide', flushUsage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushUsage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const reportWebVital = useCallback((metric) => {
    if (!['LCP', 'INP', 'CLS'].includes(metric.name) || navigator.doNotTrack === '1') return;
    enqueueUsage('webVitals', { name: metric.name, value: metric.value, rating: metric.rating, deviceCategory: deviceCategoryForWidth(window.innerWidth) });
  }, []);
  useReportWebVitals(reportWebVital);

  useEffect(() => {
    if (isSurveyPreview) return;
    const pageType = pageTypeForPath(pathname);
    if (!pageType || navigator.doNotTrack === '1' || lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;
    enqueueUsage('events', { pageType, deviceCategory: deviceCategoryForWidth(window.innerWidth) });
  }, [isSurveyPreview, pathname]);

  return null;
}

const usageQueue = { events: [], webVitals: [] };
let flushTimer;

function flushUsage() {
  window.clearTimeout(flushTimer);
  flushTimer = undefined;
  if (!usageQueue.events.length && !usageQueue.webVitals.length) return;
  const payload = { events: usageQueue.events.splice(0, 20), webVitals: usageQueue.webVitals.splice(0, 20) };
  void fetch('/api/usage/pageview', {
    method: 'POST', credentials: 'omit', cache: 'no-store', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }).catch(() => {});
  if (usageQueue.events.length || usageQueue.webVitals.length) flushTimer = window.setTimeout(flushUsage, 5_000);
}

function enqueueUsage(kind, value) {
  usageQueue[kind].push(value);
  if (!flushTimer) flushTimer = window.setTimeout(flushUsage, 5_000);
}

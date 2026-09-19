'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/components/LocaleProvider';

const NOTICE_KEY = 'tfv-cookie-notice-v1';

export default function CookieNotice() {
  const { t } = useI18n('general.cookies.notice');
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setVisible(window.localStorage.getItem(NOTICE_KEY) !== 'dismissed'); }
      catch { setVisible(true); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    try { window.localStorage.setItem(NOTICE_KEY, 'dismissed'); } catch { /* The notice can still be closed for this page view. */ }
    setVisible(false);
  }

  if (!visible || pathname.startsWith('/admin')) return null;
  return <aside className="cookie-notice" aria-label={t('label')}>
    <p>{t('text')} <Link href="/informasjonskapsler">{t('readMore')}</Link></p>
    <button type="button" onClick={dismiss}>{t('close')}</button>
  </aside>;
}

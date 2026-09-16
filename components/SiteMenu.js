'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';

export default function SiteMenu({ isAdmin, canSyncMatrikkel }) {
  const { t } = useI18n('general.navigation');
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const button = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event) => { if (!container.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="relative" ref={container}>
      <button ref={button} type="button" className="flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-white/35 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-expanded={open} aria-controls="site-navigation" aria-label={open ? t('closeMenu') : t('openMenu')} onClick={() => setOpen(!open)}>
        <span>{t('menu')}</span><svg className="size-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24" aria-hidden="true"><path d={open ? 'M6 6l12 12M6 18L18 6' : 'M3 6h18M3 12h18M3 18h18'} /></svg>
      </button>
      <nav id="site-navigation" className="absolute top-[calc(100%+0.65rem)] right-0 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-foreground/15 bg-white p-2 text-foreground shadow-xl shadow-[#493F39]/10" aria-label={t('mainMenu')} hidden={!open}>
        <Link className="flex min-h-11 items-center rounded-xl px-3.5 py-2.5 text-sm font-semibold transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary" href={isAdmin ? "/admin" : "/admin/login"} onClick={() => setOpen(false)}>{isAdmin ? t('memberService') : t('login')}</Link>
        {canSyncMatrikkel && <Link className="flex min-h-11 items-center rounded-xl px-3.5 py-2.5 text-sm font-semibold transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary" href="/admin/members/matrikkel" onClick={() => setOpen(false)}>{t('updateCadastral')}</Link>}
      </nav>
    </div>
  );
}

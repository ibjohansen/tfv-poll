'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import CmsPageView from '@/components/CmsPageView';

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

function dateTimeValue(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function PublicArticleDirectory({ pages, initialPage = null }) {
  const [selected, setSelected] = useState(initialPage);
  const [loadingSlug, setLoadingSlug] = useState('');
  const [error, setError] = useState('');
  const closeButton = useRef(null);
  const requestNumber = useRef(0);

  async function openArticle(slug, updateHistory = true) {
    const request = ++requestNumber.current;
    setLoadingSlug(slug);
    setError('');
    try {
      const response = await fetch(`/api/cms/pages/${encodeURIComponent(slug)}`, { headers: { Accept: 'application/json' } });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke hente artikkelen.');
      if (request !== requestNumber.current) return;
      setSelected(body.page);
      if (updateHistory) window.history.pushState({}, '', `/?article=${encodeURIComponent(slug)}`);
    } catch (fetchError) {
      if (request === requestNumber.current) setError(fetchError.message);
    } finally {
      if (request === requestNumber.current) setLoadingSlug('');
    }
  }

  function closeArticle() {
    requestNumber.current += 1;
    setSelected(null);
    setLoadingSlug('');
    setError('');
    if (new URL(window.location.href).searchParams.has('article')) window.history.replaceState({}, '', '/');
  }

  useEffect(() => {
    function onPopState() {
      const slug = new URL(window.location.href).searchParams.get('article');
      if (slug) openArticle(slug, false);
      else setSelected(null);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    function onKeyDown(event) {
      if (event.key === 'Escape') closeArticle();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [selected]);

  return (
    <>
      <section className="border-t border-slate-200 bg-white px-5 py-20 sm:px-8 lg:py-24" aria-labelledby="pages-title">
        <div className="mx-auto w-full max-w-7xl">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Fra Turufjell vel</p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 id="pages-title" className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">Aktuelt</h2>
            <p className="max-w-lg text-sm leading-6 text-slate-500">Publiserte saker, nyttig informasjon og dokumenter fra velforeningen.</p>
          </div>
          {error && <p className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
          <div className="mt-10 grid gap-x-7 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page) => <article key={page.id} className="group relative flex min-w-0 flex-col" aria-busy={loadingSlug === page.slug}>
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-slate-100">
                {page.image ? <Image src={page.image.url} alt={page.image_alt || ''} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]" /> : <div className="flex size-full items-center justify-center bg-primary/8 text-primary/45" aria-hidden="true"><svg viewBox="0 0 24 24" className="size-10 fill-none stroke-current stroke-[1.25]"><path d="M4 18 9 12l3 3 2-2 6 5M4 5h16v14H4V5Zm11 4h.01" /></svg></div>}
              </div>
              <div className="flex flex-1 flex-col pt-5">
                <div className="flex items-center gap-3 text-xs"><p className="font-semibold tracking-[0.1em] text-primary uppercase">{page.category}</p><span className="size-1 rounded-full bg-slate-300" aria-hidden="true" /><time className="text-slate-500" dateTime={dateTimeValue(page.published_at)}>{formatDate(page.published_at)}</time></div>
                <h3 className="mt-3 text-xl leading-7 font-semibold tracking-[-0.025em] text-slate-950"><Link className="outline-none after:absolute after:inset-0 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" href={`/?article=${encodeURIComponent(page.slug)}`} onClick={(event) => { event.preventDefault(); openArticle(page.slug); }}>{page.title}</Link></h3>
                {page.intro && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{page.intro}</p>}
                <span className="relative mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">{loadingSlug === page.slug ? 'Åpner …' : 'Les saken'} <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span></span>
              </div>
            </article>)}
          </div>
        </div>
      </section>

      <button className={`public-article-backdrop${selected ? ' is-visible' : ''}`} type="button" aria-label="Lukk artikkelen" tabIndex={selected ? 0 : -1} onClick={closeArticle} />
      <aside className={`public-article-panel${selected ? ' is-open' : ''}`} aria-hidden={!selected} role="dialog" aria-modal="true" aria-labelledby={selected ? 'public-article-panel-title' : undefined}>
        {selected && <><header className="public-article-panel-header"><div><p>Artikkel</p><strong id="public-article-panel-title">{selected.title}</strong></div><button ref={closeButton} type="button" onClick={closeArticle}>Lukk <span aria-hidden="true">×</span></button></header><div className="public-article-panel-content"><CmsPageView page={selected} /></div></>}
      </aside>
    </>
  );
}

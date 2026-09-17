'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// Some existing server pages key the results component by the query. Preserve
// the user's text focus across that remount, but never steal focus after a click.
let pendingFocus = null;

export default function AutoFilterForm({ action, children, className }) {
  const router = useRouter();
  const timer = useRef(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!pendingFocus || pendingFocus.href !== `${window.location.pathname}${window.location.search}`) return;
    const { name, start, end, type } = pendingFocus;
    pendingFocus = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    const input = type === 'select' ? [...document.querySelectorAll('select')].find((element) => element.name === name)?.previousElementSibling
      : [...document.querySelectorAll('input')].find((element) => element.name === name);
    input?.focus({ preventScroll: true });
    if (input && typeof start === 'number') input.setSelectionRange(start, end);
  });
  function apply(form) {
    clearTimeout(timer.current);
    if (!form.checkValidity()) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (String(value).trim()) params.append(key, String(value).trim());
    const current = new URL(window.location.href);
    for (const key of ['lang', 'sort', 'dir']) if (current.searchParams.has(key) && !params.has(key)) params.set(key, current.searchParams.get(key));
    const href = `${action}${params.size ? `?${params}` : ''}`;
    const focused = document.activeElement;
    pendingFocus = form.contains(focused) && ['text', 'search'].includes(focused.type)
      ? { href, name: focused.name, start: focused.selectionStart, end: focused.selectionEnd } : null;
    if (form.contains(focused) && focused.matches('[role="combobox"]')) pendingFocus = { href, name: focused.nextElementSibling?.name, type: 'select' };
    startTransition(() => router.replace(href, { scroll: false }));
  }
  return <form action={action} className={className} aria-busy={pending} onSubmit={(event) => { event.preventDefault(); apply(event.currentTarget); }}
    onCompositionStart={() => clearTimeout(timer.current)} onCompositionEnd={(event) => { const form = event.currentTarget; timer.current = setTimeout(() => apply(form), 300); }} onChange={(event) => {
      clearTimeout(timer.current);
      if (event.nativeEvent.isComposing) return;
      const form = event.currentTarget;
      if (['text', 'search'].includes(event.target.type)) timer.current = setTimeout(() => apply(form), 300);
      else apply(form);
    }}>{children}</form>;
}

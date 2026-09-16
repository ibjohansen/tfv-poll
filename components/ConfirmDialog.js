'use client';

import { useEffect, useId, useRef } from 'react';
import { useI18n } from '@/components/LocaleProvider';

export default function ConfirmDialog({ open, title, description, confirmLabel, busy, onCancel, onConfirm, eyebrow, destructive = true }) {
  const { t } = useI18n('general.confirm');
  const cancelButton = useRef(null);
  const dialog = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    cancelButton.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); }
      if (event.key !== 'Tab') return;
      const buttons = [...(dialog.current?.querySelectorAll('button:not(:disabled)') || [])];
      if (!buttons.length) { event.preventDefault(); dialog.current?.focus(); return; }
      const first = buttons[0], last = buttons.at(-1);
      if (!dialog.current.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel, open]);
  if (!open) return null;
  return <div className="confirm-backdrop" role="presentation"><section ref={dialog} tabIndex={-1} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}><p className="eyebrow">{eyebrow || t('eyebrow')}</p><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p><div className="confirm-actions"><button ref={cancelButton} className="admin-button" type="button" onClick={onCancel} disabled={busy}>{t('cancel')}</button><button className={destructive ? 'confirm-delete-button' : 'primary-button'} type="button" onClick={onConfirm} disabled={busy}>{busy ? t(destructive ? 'deleting' : 'starting') : confirmLabel}</button></div></section></div>;
}

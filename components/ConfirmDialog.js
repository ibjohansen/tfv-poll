'use client';

import { useEffect, useRef } from 'react';

export default function ConfirmDialog({ open, title, description, confirmLabel, busy, onCancel, onConfirm }) {
  const cancelButton = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    cancelButton.current?.focus();
    const onKeyDown = (event) => { if (event.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel, open]);
  if (!open) return null;
  return <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description"><p className="eyebrow">Bekreft sletting</p><h2 id="confirm-title">{title}</h2><p id="confirm-description">{description}</p><div className="confirm-actions"><button ref={cancelButton} className="admin-button" type="button" onClick={onCancel} disabled={busy}>Avbryt</button><button className="confirm-delete-button" type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Sletter …' : confirmLabel}</button></div></section></div>;
}

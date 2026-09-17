'use client';

import { useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useI18n } from '@/components/LocaleProvider';
import { fileTypeLabel, formatFileSize } from '@/lib/file-format';

export default function SurveyAttachments({ surveyId, attachments, disabled, onChange }) {
  const { t, formatLocale } = useI18n('surveys.admin');
  const [titles, setTitles] = useState({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  async function upload(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;
    setBusy('upload'); setMessage(''); setMessageKind('');
    const uploaded = [];
    try {
      for (const file of files) {
        const form = new FormData();
        form.set('file', file);
        const response = await fetch(`/api/admin/surveys/${surveyId}/attachments`, { method: 'POST', body: form });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message || t('attachmentUploadError', {name: file.name}));
        uploaded.push(body.attachment);
      }
      onChange([...(attachments || []), ...uploaded]);
      setMessage(t(uploaded.length === 1 ? 'attachmentUploadedOne' : 'attachmentUploadedMany', {count: uploaded.length}));
      setMessageKind('success');
    } catch (error) {
      if (uploaded.length) onChange([...(attachments || []), ...uploaded]);
      setMessage(`${uploaded.length ? t('attachmentPartialUpload', {count: uploaded.length}) : ''}${error.message}`);
      setMessageKind('error');
    } finally { setBusy(''); }
  }

  async function saveTitle(file) {
    setBusy(`title:${file.id}`); setMessage(''); setMessageKind('');
    try {
      const response = await fetch(`/api/admin/surveys/${surveyId}/attachments/${file.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titles[file.id] || '' }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('attachmentRenameError'));
      onChange(attachments.map((item) => item.id === file.id ? body.attachment : item));
      setMessage(t('attachmentNameSaved')); setMessageKind('success');
    } catch (error) { setMessage(error.message); setMessageKind('error'); }
    finally { setBusy(''); }
  }

  async function remove() {
    const file = deleteCandidate;
    if (!file) return;
    setBusy(`delete:${file.id}`); setMessage(''); setMessageKind('');
    try {
      const response = await fetch(`/api/admin/surveys/${surveyId}/attachments/${file.id}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.message || t('attachmentRemoveError'));
      onChange(attachments.filter((item) => item.id !== file.id));
      setMessage(t('attachmentRemoved')); setMessageKind('success');
    } catch (error) { setMessage(error.message); setMessageKind('error'); }
    finally { setBusy(''); setDeleteCandidate(null); }
  }

  return <section className="survey-attachments" aria-labelledby="survey-attachments-heading">
    <div className="admin-section-header">
      <div><h3 id="survey-attachments-heading">{t('attachments')}</h3><p>{t('attachmentsHelp')}</p></div>
      <label className={`admin-button${disabled || busy ? ' is-disabled' : ''}`} title={t('addAttachmentsHelp')}>
        {busy === 'upload' ? t('uploadingAttachments') : t('addAttachments')}
        <input className="visually-hidden" type="file" multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.jpeg,.png,.webp,.gif"
          onChange={upload} disabled={disabled || Boolean(busy) || attachments.length >= 20} />
      </label>
    </div>
    {attachments.length ? <ul className="cms-attachment-editor">
      {attachments.map((file) => <li key={file.id}>
        <div className="cms-file-meta"><strong>{file.original_filename}</strong><span>{fileTypeLabel(file.mime_type, file.original_filename, t('file'))} · {formatFileSize(file.size_bytes, formatLocale)}</span></div>
        <label>{t('attachmentDisplayName')}<input value={titles[file.id] ?? file.title} maxLength={200} disabled={Boolean(busy)} onChange={(event) => setTitles((current) => ({ ...current, [file.id]: event.target.value }))} /></label>
        <div className="cms-file-actions">
          <a className="admin-button" href={file.url} target="_blank" rel="noreferrer" title={t('openAttachmentHelp')}>{t('openAttachment')}</a>
          <button className="admin-button" type="button" onClick={() => saveTitle(file)} disabled={Boolean(busy) || !String(titles[file.id] || '').trim()} title={t('saveAttachmentNameHelp')}>{t('saveAttachmentName')}</button>
          <button className="admin-button is-danger" type="button" onClick={() => setDeleteCandidate(file)} disabled={Boolean(busy)} title={t('removeAttachmentHelp')}>{t('removeAttachment')}</button>
        </div>
      </li>)}
    </ul> : <p className="cms-section-empty">{t('noAttachments')}</p>}
    {message && <p className={messageKind === 'error' ? 'form-error' : 'admin-success'} role="status">{message}</p>}
    <ConfirmDialog open={Boolean(deleteCandidate)} title={t('removeAttachmentTitle', {title: deleteCandidate?.title || ''})}
      description={t('removeAttachmentDescription')} confirmLabel={t('removeAttachment')} busy={busy.startsWith('delete:')}
      onCancel={() => setDeleteCandidate(null)} onConfirm={remove} />
  </section>;
}

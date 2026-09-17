'use client';

import Select from "@/components/Select";
import { useState } from 'react';
import Link from 'next/link';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useI18n } from '@/components/LocaleProvider';

export default function AdminMemberGroups({ initialGroups }) {
  const { t } = useI18n('admin.groups');
  const [groups, setGroups] = useState(initialGroups);
  const [selected, setSelected] = useState(null);
  const [kind, setKind] = useState('hamlet');
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function change(values) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/member-groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values), signal: AbortSignal.timeout(20000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      const refreshed = await fetch('/api/admin/member-groups', { signal: AbortSignal.timeout(15000) });
      if (!refreshed.ok) throw new Error(t('refreshError'));
      setGroups((await refreshed.json()).groups);
      if (values.action === 'create') { setSelected({ ...body.group, kind: values.kind }); setRename(body.group.name); setName(''); }
      if (values.action === 'rename') setSelected((current) => ({ ...current, name: values.name }));
      if (values.action === 'delete') { setSelected(null); setConfirmDelete(false); }
      setMessage(t('saved', {count: body.group.changed_count !== undefined ? t('processed', {count: body.group.changed_count}) : ''}));
    } catch (error) { setMessage(error.message || t('serverError')); }
    finally { setBusy(false); }
  }
  return <div className="member-groups-layout">
    <Link className="admin-button" href="/admin/members">{t('back')}</Link>
    <p>{t('help')}</p>
    <form className="admin-detail-form" onSubmit={(event) => { event.preventDefault(); change({ kind, action: 'create', name }); }}>
      <h2>{t('createTitle')}</h2><label>{t('type')}<Select value={kind} onChange={(event) => setKind(event.target.value)}><option value="hamlet">{t('hamlet')}</option><option value="email">{t('emailGroup')}</option></Select></label>
      <label>{t('name')}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></label>
      <button type="submit" className="primary-button" disabled={busy}>{t('create')}</button>
    </form>
    <div className="admin-table-scroll" role="region" aria-label={t('overview')} tabIndex={0}><table className="admin-table"><caption>{t('caption')}</caption><thead><tr><th>{t('name')}</th><th>{t('type')}</th><th>{t('properties')}</th><th>{t('memberProperties')}</th><th>{t('uniqueEmails')}</th></tr></thead>
      <tbody>{groups.map((group) => <tr key={`${group.kind}-${group.id}`}><td><button type="button" className="admin-button" disabled={busy} onClick={() => { setSelected(group); setRename(group.name); }}>{group.name}</button></td><td>{group.kind === 'hamlet' ? t('hamlet') : t('emailGroup')}</td><td>{group.plot_count}</td><td>{group.member_count}</td><td>{group.email_count}</td></tr>)}</tbody>
    </table></div>
    {selected && <section aria-label={t('edit')} className="member-profile-section">
      <h2>{selected.name}</h2><Link href={`/admin/members?${selected.kind === 'hamlet' ? 'hamlet' : 'group'}=${selected.id}`}>{t('showProperties')}</Link>
      <form className="admin-detail-form" onSubmit={(event) => { event.preventDefault(); change({ ...selected, action: 'rename', name: rename }); }}>
        <label>{t('newName')}<input value={rename} onChange={(event) => setRename(event.target.value)} maxLength={100} required /></label><button className="admin-button" disabled={busy}>{t('rename')}</button>
      </form>
      <p><button type="button" className="admin-delete" disabled={busy} onClick={() => setConfirmDelete(true)}>{t('delete')}</button></p>
    </section>}
    {message && <p role="status">{message}</p>}
    <ConfirmDialog open={confirmDelete} title={t('deleteTitle', {name: selected?.name || t('groupFallback')})} description={t('deleteDescription')} confirmLabel={t('deleteConfirm')} busy={busy} onCancel={() => setConfirmDelete(false)} onConfirm={() => change({ ...selected, action: 'delete' })} />
  </div>;
}

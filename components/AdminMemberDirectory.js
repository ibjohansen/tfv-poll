'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import MemberPropertyMap from '@/components/MemberPropertyMap';
import { useI18n } from '@/components/LocaleProvider';

const propertyFields = [['h_number', true], ['cadastral_number', true], ['section_number', true]];
const ownershipFields = [['title_holder', true, true], ['registration_date', true, true]];
const contactFields = [['primary_contact_name'], ['primary_contact_email'], ['other_contact_emails'], ['admin_comment']];

function emptyToString(value) { return value || ''; }
function displayLines(value) { return emptyToString(value).split(/\s*\/\s*/).join('\n'); }
function fieldLabel(name, value, t) {
  if (name === 'title_holder' && emptyToString(value).includes('/')) return t('fields.title_holders');
  if (name === 'registration_date' && emptyToString(value).includes('/')) return t('fields.registration_dates');
  return t(`fields.${name}`);
}
function selectOnKey(event, member, select) {
  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(member); }
}

function formFromMember(member) {
  return { ...member, other_contact_emails: (member.other_contact_emails || []).join('\n') };
}

function payloadFromForm(form) {
  return { ...form, other_contact_emails: form.other_contact_emails.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean) };
}

function payloadKey(form) {
  return form ? JSON.stringify(payloadFromForm(form)) : '';
}

export default function AdminMemberDirectory({ data, surveys, search, sort, direction, incompleteContact, hasComment = false, initialSelected = null, membershipStatus = '', hamletId = '', groupId = '', turufjellAsSharing = '', groups = [], canMatrikkelSync = false }) {
  const { t } = useI18n('members.adminDirectory');
  const router = useRouter();
  const [selected, setSelected] = useState(initialSelected);
  const [form, setForm] = useState(() => initialSelected ? formFromMember(initialSelected) : null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState(data.members);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [newToken, setNewToken] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState('all');
  const [exportSurveyId, setExportSurveyId] = useState(surveys[0]?.id || '');
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [excludeTurufjellAsOptOut, setExcludeTurufjellAsOptOut] = useState(true);
  const [saveState, setSaveState] = useState(initialSelected ? 'saved' : 'idle');
  const savedPayload = useRef(initialSelected ? payloadKey(formFromMember(initialSelected)) : '');
  const formVersion = useRef(0);
  const savingRef = useRef(false);
  const sentinel = useRef(null);
  const exportCancelButton = useRef(null);
  const detailCloseButton = useRef(null);
  const detailTrigger = useRef(null);
  const detailsOpen = Boolean(selected);
  useEffect(() => {
    if (!detailsOpen) return;
    detailCloseButton.current?.focus();
    return () => { if (detailTrigger.current?.isConnected) detailTrigger.current.focus(); };
  }, [detailsOpen]);
  const activeFilters = useMemo(() => ({ ...(incompleteContact ? { contact: 'incomplete' } : {}), ...(hasComment ? { comment: 'present' } : {}), ...(membershipStatus ? { membership: membershipStatus } : {}), ...(hamletId ? { hamlet: hamletId } : {}), ...(groupId ? { group: groupId } : {}), ...(turufjellAsSharing ? { sharing: turufjellAsSharing } : {}) }), [hasComment, incompleteContact, membershipStatus, hamletId, groupId, turufjellAsSharing]);
  const sortHref = (column) => `/admin/members?${new URLSearchParams({ q: search, sort: column, dir: sort === column && direction === 'asc' ? 'desc' : 'asc', ...activeFilters })}`;
  const sortLabel = (column, label) => `${label}${sort === column ? direction === 'asc' ? ' ↑' : ' ↓' : ''}`;
  const hasMore = members.length < data.total;
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore || loadingMore) return undefined;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setLoadingMore(true); setLoadError('');
      try {
        const query = new URLSearchParams({ q: search, page: String(page + 1), sort, dir: direction, ...activeFilters });
        const response = await fetch(`/api/admin/members?${query}`);
        const next = await response.json();
        if (!response.ok) throw new Error(next.message);
        setMembers((current) => [...current, ...next.members]);
        setPage((current) => current + 1);
      } catch (error) { setLoadError(error.message || t('loadMoreError')); }
      finally { setLoadingMore(false); }
    }, { rootMargin: '240px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeFilters, direction, hasMore, loadingMore, page, search, sort, t]);
  useEffect(() => {
    if (!exportOpen) return undefined;
    exportCancelButton.current?.focus();
    const onKeyDown = (event) => { if (event.key === 'Escape' && !exporting) setExportOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [exportOpen, exporting]);
  const select = (member) => { const next = formFromMember(member); detailTrigger.current = document.activeElement; formVersion.current += 1; savedPayload.current = payloadKey(next); setSelected(member); setForm(next); setSaveState('saved'); setMessage(''); setNewToken(''); };
  const create = () => { const next = { h_number: '', cadastral_number: '', section_number: '', street_address: '', title_holder: '', registration_date: '', primary_contact_name: '', primary_contact_email: '', other_contact_emails: '', admin_comment: '', turufjell_as_sharing_opt_out: false }; formVersion.current += 1; savedPayload.current = ''; setSelected({ isNew: true }); setForm(next); setSaveState('idle'); setMessage(''); setNewToken(''); };
  const close = () => { setSelected(null); setForm(null); setNewToken(''); };
  const updateForm = (name, value) => { formVersion.current += 1; setForm((current) => ({ ...current, [name]: value })); };
  const persistForm = useCallback(async (payload, version, wasNew, memberId) => {
    if (savingRef.current) return false;
    savingRef.current = true; setSaving(true); setSaveState('saving'); setMessage('');
    try {
      const response = await fetch(wasNew ? '/api/admin/members' : `/api/admin/members/${memberId}`, { method: wasNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000) });
      const body = await response.json();
      if (!response.ok || !body.ok) { setMessage(body.message || t('saveError')); setSaveState('error'); return false; }
      const returnedForm = formFromMember(body.member);
      savedPayload.current = payloadKey(returnedForm);
      setMembers((current) => wasNew ? [body.member, ...current] : current.map((item) => String(item.id) === String(body.member.id) ? { ...item, ...body.member } : item));
      setSelected(body.member);
      if (formVersion.current === version) setForm(returnedForm);
      setNewToken(''); setSaveState(formVersion.current === version ? 'saved' : 'dirty');
      setMessage(wasNew ? body.member.hamlet_name
        ? t('createdHamlet', {name: body.member.hamlet_name})
        : body.member.street_address ? t('createdNoHamlet')
          : t('createdNeedsAddress') : '');
      router.refresh();
      return true;
    } catch { setMessage(t('serverError')); setSaveState('error'); return false; }
    finally { savingRef.current = false; setSaving(false); }
  }, [router, t]);
  async function save(event) {
    event.preventDefault();
    await persistForm(payloadFromForm(form), formVersion.current, Boolean(selected.isNew), selected.id);
  }
  useEffect(() => {
    if (!form || !selected || selected.isNew || data.mock || saving) return undefined;
    const key = payloadKey(form);
    if (key === savedPayload.current) { setSaveState('saved'); return undefined; }
    setSaveState('dirty');
    const version = formVersion.current;
    const memberId = selected.id;
    const timer = setTimeout(() => persistForm(payloadFromForm(form), version, false, memberId), 900);
    return () => clearTimeout(timer);
  }, [form, selected, data.mock, saving, persistForm]);
  async function remove() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/members/${selected.id}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) { setConfirmDelete(false); setMessage(body.message || t('deleteError')); return; }
      setMembers((current) => current.filter((item) => String(item.id) !== String(selected.id)));
      setConfirmDelete(false); close(); router.refresh();
    } catch {
      setConfirmDelete(false); setMessage(t('deleteServerError'));
    } finally { setDeleting(false); }
  }
  function toggleChecked(id) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(String(id))) next.delete(String(id)); else next.add(String(id));
      return next;
    });
  }
  async function exportMembers(event) {
    event.preventDefault();
    setExporting(true); setExportMessage('');
    try {
      const response = await fetch('/api/admin/members/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: exportScope, membershipStatus, memberIds: [...checked], surveyId: exportSurveyId, excludeTurufjellAsOptOut }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || t('exportError'));
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'medlemsregister.xlsx';
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(href);
      setExportOpen(false);
    } catch (error) { setExportMessage(error.message || t('exportError')); }
    finally { setExporting(false); }
  }
  const renderField = ([name, lockedAfterCreation, multiLine]) => { const readOnly = Boolean(lockedAfterCreation && !selected.isNew); return <div className="admin-detail-field" key={name}><label>{fieldLabel(name, form[name], t)}{name === 'admin_comment' || name === 'other_contact_emails' || multiLine ? <textarea value={multiLine ? displayLines(form[name]) : emptyToString(form[name])} onChange={(event) => updateForm(name, event.target.value)} rows={multiLine ? 3 : name === 'admin_comment' ? 5 : 3} readOnly={readOnly} /> : <input value={emptyToString(form[name])} onChange={(event) => updateForm(name, event.target.value)} required={name === 'h_number'} readOnly={readOnly} />}{name === 'other_contact_emails' && <span className="admin-field-note">{t('emailLines')}</span>}</label></div>; };
  const matrikkelSelection = [...checked].join(',');
  const countSuffix = `${incompleteContact ? t('incompleteSuffix') : ''}${hasComment ? t('commentSuffix') : ''}${!incompleteContact && !hasComment && search ? t('foundSuffix') : ''}${data.mock ? t('mockSuffix') : ''}`;
  return <>
    <div className="admin-toolbar"><Link className="admin-button" href="/admin/members/groups">{t('groups')}</Link></div>
    <div className="admin-toolbar">
      <button className="admin-button" type="button" onClick={() => { setExportScope(checked.size ? 'selected' : 'all'); setExportMessage(''); setExportOpen(true); }} disabled={data.mock || !surveys.length}>{t('export', {selection: checked.size ? t('selectedSuffix', {count: checked.size}) : ''})}</button>
      {canMatrikkelSync && checked.size > 0 && <Link className="admin-button" href={`/admin/members/matrikkel?members=${encodeURIComponent(matrikkelSelection)}`}>{t('updateSelected', {count: checked.size})}</Link>}
      <button className="primary-button" type="button" onClick={create}>{t('newMember')}</button>
    </div>
    <form className="admin-search admin-member-filters" action="/admin/members">
      <div className="admin-filter-grid">
        <label>{t('membershipStatus')}<select name="membership" defaultValue={membershipStatus}><option value="">{t('allProperties')}</option><option value="member">{t('regularMembers')}</option><option value="exempt">{t('exemptMembership')}</option></select></label>
        <label>{t('hamlet')}<select name="hamlet" defaultValue={hamletId}><option value="">{t('allHamlets')}</option><option value="unassigned">{t('noHamlet')}</option>{groups.filter((group) => group.kind === 'hamlet').map((group) => <option value={group.id} key={group.id}>{group.name} ({group.plot_count})</option>)}</select></label>
        <label>{t('emailGroup')}<select name="group" defaultValue={groupId}><option value="">{t('allGroups')}</option>{groups.filter((group) => group.kind === 'email').map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
        <label>{t('sharing')}<select name="sharing" defaultValue={turufjellAsSharing}><option value="">{t('all')}</option><option value="allowed">{t('allowed')}</option><option value="opted_out">{t('optedOut')}</option></select></label>
      </div>
      <fieldset className="admin-filter-toggles"><legend>{t('onlyShow')}</legend><label><input type="checkbox" name="contact" value="incomplete" defaultChecked={incompleteContact} /> {t('incomplete')}</label><label><input type="checkbox" name="comment" value="present" defaultChecked={hasComment} /> {t('withComment')}</label></fieldset>
      <label htmlFor="member-search">{t('search')}</label><div><input id="member-search" name="q" type="search" defaultValue={search} placeholder={t('searchPlaceholder')} maxLength={200} /><button className="primary-button" type="submit">{t('applyFilter')}</button>{(search || Object.keys(activeFilters).length > 0) && <Link href="/admin/members">{t('resetFilter')}</Link>}</div>
    </form>
    <p className="admin-count" role="status">{t('count', {count: data.total, suffix: countSuffix})}</p>
    {members.length ? <>
      <div className="admin-table-scroll" role="region" aria-label={t('members')} tabIndex={0}><table className="admin-table"><caption>{t('tableCaption')}</caption><thead><tr>
        <th className="admin-select-column" scope="col"><span className="visually-hidden">{t('selectAction')}</span></th>
        <th scope="col"><Link className="admin-sort" href={sortHref('h_number')}>{sortLabel('h_number', t('fields.h_number'))}</Link></th>
        <th scope="col"><Link className="admin-sort" href={sortHref('street_address')}>{sortLabel('street_address', t('address'))}</Link></th>
        <th scope="col"><Link className="admin-sort" href={sortHref('title_holder')}>{sortLabel('title_holder', t('owner'))}</Link></th>
        <th scope="col"><Link className="admin-sort" href={sortHref('primary_contact_email')}>{sortLabel('primary_contact_email', t('fields.primary_contact_email'))}</Link></th>
        <th scope="col">{t('hamlet')}</th><th scope="col">{t('membershipStatus')}</th><th scope="col">{t('turufjellAs')}</th>{hasComment && <th scope="col">{t('internalNote')}</th>}
      </tr></thead><tbody>{members.map((member) => <tr className="admin-clickable-row" key={member.id} tabIndex={0} onClick={() => select(member)} onKeyDown={(event) => selectOnKey(event, member, select)}>
        <td className="admin-select-column" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={checked.has(String(member.id))} onChange={() => toggleChecked(member.id)} aria-label={t('selectMember', {id: member.h_number})} /></td>
        <th scope="row">{member.h_number}</th><td>{member.street_address || t('notRegistered')}</td><td>{member.title_holder || member.primary_contact_name || t('notRegistered')}</td><td>{member.primary_contact_email || t('notRegistered')}{member.shared_email_groups?.length > 0 && <small className="shared-contact-badge">{t('sharedEmail')}</small>}</td><td>{member.hamlet_name || t('notLinked')}</td><td>{member.membership_status === 'exempt' ? t('exemptMembership') : t('regularMember')}</td><td>{member.turufjell_as_sharing_opt_out ? t('optedOut') : t('allowed')}</td>{hasComment && <td className="admin-comment">{member.admin_comment}</td>}
      </tr>)}</tbody></table></div>
      <div className="admin-load-more" ref={sentinel} aria-live="polite">{loadingMore ? t('loadingMore') : loadError || (hasMore ? t('scrollMore') : t('allLoaded'))}</div>
    </> : <p>{t('noResults')}</p>}
    <aside className={`admin-detail-panel${selected ? ' is-open' : ''}`} aria-hidden={!selected} aria-label={t('editMember')} onKeyDown={(event) => { if (event.key === 'Escape' && !saving && !confirmDelete) { event.stopPropagation(); close(); } }}>
      <div className="admin-detail-header"><div><p className="eyebrow">{selected?.isNew ? t('newMember') : t('member')}</p><h2>{selected?.isNew ? t('createMember') : selected?.h_number}</h2>{!selected?.isNew && <span className={`admin-save-status is-${saveState}`} role="status">{t(`saveStates.${saveState}`)}</span>}</div><button className="admin-button" type="button" ref={detailCloseButton} onClick={close} disabled={saving}>{t('close')}</button></div>
      {form && <form className="admin-detail-form" onSubmit={save}>
        <section aria-label={t('sharedProperties')}>{selected.shared_email_groups?.map((group) => <details key={group.email}><summary>{group.email} · {t('propertyCount', {count: group.properties.length})}</summary><ul>{group.properties.map((property) => <li key={property.id}><Link href={`/admin/members?member=${encodeURIComponent(property.id)}`}>{property.h_number} · {property.contact_name || t('contactMissing')} · {property.street_address || t('addressMissing')}</Link></li>)}</ul></details>)}</section>
        {canMatrikkelSync && !selected.isNew && <Link className="admin-button" href={`/admin/members/matrikkel?member=${encodeURIComponent(selected.id)}`}>{t('updateMember')}</Link>}
        <label>{t('membershipStatus')}<select value={form.membership_status || 'member'} onChange={(event) => updateForm('membership_status', event.target.value)}><option value="member">{t('regularMember')}</option><option value="exempt">{t('exemptMembership')}</option></select></label>
        <label className="admin-checkbox"><input type="checkbox" checked={Boolean(form.turufjell_as_sharing_opt_out)} onChange={(event) => updateForm('turufjell_as_sharing_opt_out', event.target.checked)} /> {t('optOut')}</label><span className="admin-field-note">{t('optOutNote')}</span>
        <div className="admin-detail-field-grid is-property">{propertyFields.map(renderField)}</div>{renderField(['street_address', true])}<div className="admin-detail-field-grid is-ownership">{ownershipFields.map(renderField)}</div>{selected?.street_address && <MemberPropertyMap streetAddress={selected.street_address} />}{contactFields.map(renderField)}
        {newToken && <p className="admin-success">{t('memberId', {id: newToken})}</p>}{message && <p className={saveState === 'error' ? 'form-error' : 'admin-success'} role="status">{message}</p>}
        <button className="primary-button" type="submit" disabled={saving || data.mock}>{saving ? t('saving') : selected.isNew ? t('createMember') : t('saveNow')}</button>{!selected.isNew && <button className="admin-delete" type="button" onClick={() => setConfirmDelete(true)} disabled={data.mock}>{t('delete')}</button>}{data.mock && <p className="privacy-subnote">{t('mockReadonly')}</p>}
      </form>}
    </aside>
    <ConfirmDialog open={confirmDelete} title={t('deleteTitle', {id: selected?.h_number || ''})} description={t('deleteDescription')} confirmLabel={t('delete')} busy={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
    {exportOpen && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title"><p className="eyebrow">{t('exportEyebrow')}</p><h2 id="export-title">{t('exportTitle')}</h2><form className="export-form" onSubmit={exportMembers}>
      <fieldset><legend>{t('exportMembers')}</legend><label><input type="radio" name="export-scope" value="all" checked={exportScope === 'all'} onChange={() => setExportScope('all')} /> {t('exportAll')}</label><label><input type="radio" name="export-scope" value="selected" checked={exportScope === 'selected'} onChange={() => setExportScope('selected')} disabled={!checked.size} /> {t('exportSelected', {count: checked.size})}</label></fieldset>
      <label className="admin-checkbox"><input type="checkbox" checked={excludeTurufjellAsOptOut} onChange={(event) => setExcludeTurufjellAsOptOut(event.target.checked)} /> {t('excludeOptOut')}</label>
      <label htmlFor="export-survey">{t('survey')}<select id="export-survey" value={exportSurveyId} onChange={(event) => setExportSurveyId(event.target.value)} required>{surveys.map((survey) => <option value={survey.id} key={survey.id}>{survey.title}{survey.has_ended ? t('ended') : survey.is_open ? '' : t('closed')}</option>)}</select></label>
      <p className="privacy-subnote">{t('exportPrivacy')}</p>{exportMessage && <p className="form-error" role="alert">{exportMessage}</p>}<div className="confirm-actions"><button ref={exportCancelButton} className="admin-button" type="button" onClick={() => setExportOpen(false)} disabled={exporting}>{t('cancel')}</button><button className="primary-button" type="submit" disabled={exporting || !exportSurveyId || (exportScope === 'selected' && !checked.size)}>{exporting ? t('generating') : t('download')}</button></div>
    </form></section></div>}
  </>;
}

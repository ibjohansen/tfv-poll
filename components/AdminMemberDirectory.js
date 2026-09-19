'use client';

import Select from "@/components/Select";
import Link from 'next/link';
import AutoFilterForm from '@/components/AutoFilterForm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import MemberPropertyMap from '@/components/MemberPropertyMap';
import { useI18n } from '@/components/LocaleProvider';
import { MEMBER_CONTACT_FIELDS, MEMBER_OWNERSHIP_FIELDS, MEMBER_PROPERTY_FIELDS } from '@/lib/member-detail-sections';

const propertyFields = MEMBER_PROPERTY_FIELDS;
const ownershipFields = MEMBER_OWNERSHIP_FIELDS;
const contactFields = MEMBER_CONTACT_FIELDS;

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
  return {
    h_number: form.h_number,
    cadastral_number: form.cadastral_number,
    section_number: form.section_number,
    street_address: form.street_address,
    title_holder: form.title_holder,
    registration_date: form.registration_date,
    primary_contact_name: form.primary_contact_name,
    primary_contact_email: form.primary_contact_email,
    other_contact_emails: form.other_contact_emails.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean),
    admin_comment: form.admin_comment,
    membership_status: form.membership_status,
    turufjell_as_sharing_opt_out: form.turufjell_as_sharing_opt_out,
  };
}

function payloadKey(form) {
  return form ? JSON.stringify(payloadFromForm(form)) : '';
}

export default function AdminMemberDirectory({ data, surveys, search, sort, direction, incompleteContact, hasComment = false, initialSelected = null, membershipStatus = '', hamletId = '', groupId = '', turufjellAsSharing = '', groups = [], canMatrikkelSync = false }) {
  const { t } = useI18n('members.adminDirectory');
  const [selected, setSelected] = useState(initialSelected);
  const [form, setForm] = useState(() => initialSelected ? formFromMember(initialSelected) : null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const resultKey = JSON.stringify([search, sort, direction, incompleteContact, hasComment, membershipStatus, hamletId, groupId, turufjellAsSharing]);
  const [memberResult, setMemberResult] = useState(() => ({ key: resultKey, members: data.members, page: 1 }));
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
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [groupBusy, setGroupBusy] = useState('');
  const [groupMessage, setGroupMessage] = useState(null);
  const [saveState, setSaveState] = useState(initialSelected ? 'saved' : 'idle');
  const savedPayload = useRef(initialSelected ? payloadKey(formFromMember(initialSelected)) : '');
  const formVersion = useRef(0);
  const saveController = useRef(null);
  const saveRequest = useRef(0);
  const sentinel = useRef(null);
  const exportCancelButton = useRef(null);
  const detailCloseButton = useRef(null);
  const detailTrigger = useRef(null);
  const detailsOpen = Boolean(selected);
  const emailGroups = useMemo(() => groups.filter((group) => group.kind === 'email'), [groups]);
  const hamlets = useMemo(() => groups.filter((group) => group.kind === 'hamlet'), [groups]);
  useEffect(() => {
    if (!detailsOpen) return;
    detailCloseButton.current?.focus();
    return () => { if (detailTrigger.current?.isConnected) detailTrigger.current.focus(); };
  }, [detailsOpen]);
  const activeFilters = useMemo(() => ({ ...(incompleteContact ? { contact: 'incomplete' } : {}), ...(hasComment ? { comment: 'present' } : {}), ...(membershipStatus ? { membership: membershipStatus } : {}), ...(hamletId ? { hamlet: hamletId } : {}), ...(groupId ? { group: groupId } : {}), ...(turufjellAsSharing ? { sharing: turufjellAsSharing } : {}) }), [hasComment, incompleteContact, membershipStatus, hamletId, groupId, turufjellAsSharing]);
  const sortHref = (column) => `/admin/members?${new URLSearchParams({ q: search, sort: column, dir: sort === column && direction === 'asc' ? 'desc' : 'asc', ...activeFilters })}`;
  const sortLabel = (column, label) => `${label}${sort === column ? direction === 'asc' ? ' ↑' : ' ↓' : ''}`;
  const currentResult = memberResult.key === resultKey ? memberResult : { key: resultKey, members: data.members, page: 1 };
  const { members, page } = currentResult;
  const updateMembers = useCallback((change) => setMemberResult((current) => {
    const base = current.key === resultKey ? current : { key: resultKey, members: data.members, page: 1 };
    return { ...base, members: typeof change === 'function' ? change(base.members) : change };
  }), [data.members, resultKey]);
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
        setMemberResult((current) => {
          const base = current.key === resultKey ? current : { key: resultKey, members: data.members, page: 1 };
          return { ...base, members: [...base.members, ...next.members], page: base.page + 1 };
        });
      } catch (error) { setLoadError(error.message || t('loadMoreError')); }
      finally { setLoadingMore(false); }
    }, { rootMargin: '240px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeFilters, data.members, direction, hasMore, loadingMore, page, resultKey, search, sort, t]);
  useEffect(() => {
    if (!exportOpen) return undefined;
    exportCancelButton.current?.focus();
    const onKeyDown = (event) => { if (event.key === 'Escape' && !exporting) setExportOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [exportOpen, exporting]);
  const select = (member) => { const next = formFromMember(member); detailTrigger.current = document.activeElement; formVersion.current += 1; savedPayload.current = payloadKey(next); setSelected(member); setForm(next); setSaveState('saved'); setMessage(''); setGroupMessage(null); setNewToken(''); };
  const create = () => { const next = { h_number: '', cadastral_number: '', section_number: '', street_address: '', title_holder: '', registration_date: '', primary_contact_name: '', primary_contact_email: '', other_contact_emails: '', admin_comment: '', membership_status: 'member', turufjell_as_sharing_opt_out: false }; formVersion.current += 1; savedPayload.current = ''; setSelected({ isNew: true }); setForm(next); setSaveState('idle'); setMessage(''); setGroupMessage(null); setNewToken(''); };
  const close = () => { setSelected(null); setForm(null); setGroupMessage(null); setNewToken(''); };
  const updateForm = (name, value) => { formVersion.current += 1; setForm((current) => ({ ...current, [name]: value })); };
  const persistForm = useCallback(async (payload, version, wasNew, memberId) => {
    saveController.current?.abort();
    const controller = new AbortController();
    saveController.current = controller;
    const request = ++saveRequest.current;
    setSaving(true); setSaveState('saving'); setMessage('');
    try {
      const response = await fetch(wasNew ? '/api/admin/members' : `/api/admin/members/${memberId}`, { method: wasNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
      const body = await response.json();
      if (request !== saveRequest.current) return false;
      if (!response.ok || !body.ok) { setMessage(body.message || t('saveError')); setSaveState('error'); return false; }
      const returnedForm = formFromMember(body.member);
      savedPayload.current = payloadKey(returnedForm);
      updateMembers((current) => wasNew ? [body.member, ...current] : current.map((item) => String(item.id) === String(body.member.id) ? { ...item, ...body.member } : item));
      setSelected((current) => current && String(current.id) === String(body.member.id) ? { ...current, ...body.member } : body.member);
      if (formVersion.current === version) setForm(returnedForm);
      setNewToken(''); setSaveState(formVersion.current === version ? 'saved' : 'dirty');
      setMessage(wasNew ? body.member.hamlet_name
        ? t('createdHamlet', {name: body.member.hamlet_name})
        : body.member.street_address ? t('createdNoHamlet')
          : t('createdNeedsAddress') : '');
      return true;
    } catch (error) {
      if (controller.signal.aborted || request !== saveRequest.current) return false;
      setMessage(t('serverError')); setSaveState('error'); return false;
    }
    finally {
      if (request === saveRequest.current) { saveController.current = null; setSaving(false); }
    }
  }, [t, updateMembers]);
  useEffect(() => () => saveController.current?.abort(), []);
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
      updateMembers((current) => current.filter((item) => String(item.id) !== String(selected.id)));
      setConfirmDelete(false); close();
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
  async function changeGroupMembership(group, action, memberIds, busyKey) {
    setGroupBusy(busyKey); setGroupMessage(null);
    try {
      const response = await fetch('/api/admin/member-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: group.kind, id: group.id, action, memberIds }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || t('groupSaveError'));
      const groupIdValue = String(group.id);
      const memberIdSet = new Set(memberIds.map(String));
      const updateMembership = (member) => {
        if (!member || !memberIdSet.has(String(member.id))) return member;
        if (group.kind === 'hamlet') return action === 'add'
          ? { ...member, hamlet_id: group.id, hamlet_name: group.name }
          : { ...member, hamlet_id: null, hamlet_name: null };
        const current = new Set((member.email_group_ids || []).map(String));
        if (action === 'add') current.add(groupIdValue); else current.delete(groupIdValue);
        return { ...member, email_group_ids: [...current] };
      };
      updateMembers((current) => current.map(updateMembership));
      setSelected((current) => updateMembership(current));
      const text = group.kind === 'hamlet'
        ? action === 'add' ? t('hamletAssigned', {name: group.name}) : t('hamletRemoved')
        : action === 'add' ? t('groupAdded', { count: body.group?.changed_count ?? 0, name: group.name }) : t('groupRemoved', { name: group.name });
      setGroupMessage({ type: 'success', text });
      return true;
    } catch (error) {
      setGroupMessage({ type: 'error', text: error.message || t('groupSaveError') });
      return false;
    } finally { setGroupBusy(''); }
  }
  async function assignSelectedToGroup() {
    const group = emailGroups.find((item) => String(item.id) === String(bulkGroupId));
    if (!group || !checked.size) return;
    await changeGroupMembership(group, 'add', [...checked], 'bulk');
  }
  async function changeSelectedHamlet(nextHamletId) {
    const currentHamlet = hamlets.find((group) => String(group.id) === String(selected.hamlet_id));
    const nextHamlet = hamlets.find((group) => String(group.id) === String(nextHamletId));
    if (nextHamlet) await changeGroupMembership(nextHamlet, 'add', [selected.id], 'hamlet');
    else if (currentHamlet) await changeGroupMembership(currentHamlet, 'remove', [selected.id], 'hamlet');
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
    {checked.size > 0 && <section className="admin-bulk-group-action" aria-label={t('assignSelected')}>
      <label htmlFor="bulk-email-group">{t('assignSelected', {count: checked.size})}<Select id="bulk-email-group" value={bulkGroupId} onChange={(event) => setBulkGroupId(event.target.value)} disabled={Boolean(groupBusy) || data.mock}><option value="">{t('chooseEmailGroup')}</option>{emailGroups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</Select></label>
      <button className="primary-button" type="button" disabled={!bulkGroupId || Boolean(groupBusy) || data.mock} onClick={assignSelectedToGroup}>{groupBusy === 'bulk' ? t('assigning') : t('addSelectedToGroup', {count: checked.size})}</button>
    </section>}
    {groupMessage && !selected && <p className={groupMessage.type === 'error' ? 'form-error' : 'admin-success'} role="status">{groupMessage.text}</p>}
    <AutoFilterForm className="admin-search admin-member-filters" action="/admin/members">
      <div className="admin-filter-grid">
        <label>{t('membershipStatus')}<Select name="membership" defaultValue={membershipStatus}><option value="">{t('allProperties')}</option><option value="member">{t('regularMembers')}</option><option value="exempt">{t('exemptMembership')}</option></Select></label>
        <label>{t('hamlet')}<Select name="hamlet" defaultValue={hamletId}><option value="">{t('allHamlets')}</option><option value="unassigned">{t('noHamlet')}</option>{groups.filter((group) => group.kind === 'hamlet').map((group) => <option value={group.id} key={group.id}>{group.name} ({group.plot_count})</option>)}</Select></label>
        <label>{t('emailGroup')}<Select name="group" defaultValue={groupId}><option value="">{t('allGroups')}</option>{groups.filter((group) => group.kind === 'email').map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</Select></label>
        <label>{t('sharing')}<Select name="sharing" defaultValue={turufjellAsSharing}><option value="">{t('all')}</option><option value="allowed">{t('allowed')}</option><option value="opted_out">{t('optedOut')}</option></Select></label>
      </div>
      <fieldset className="admin-filter-toggles"><legend>{t('onlyShow')}</legend><label><input type="checkbox" name="contact" value="incomplete" defaultChecked={incompleteContact} /> {t('incomplete')}</label><label><input type="checkbox" name="comment" value="present" defaultChecked={hasComment} /> {t('withComment')}</label></fieldset>
      <label htmlFor="member-search">{t('search')}</label><div><input id="member-search" name="q" type="search" defaultValue={search} placeholder={t('searchPlaceholder')} maxLength={200} />{(search || Object.keys(activeFilters).length > 0) && <Link href="/admin/members">{t('resetFilter')}</Link>}</div>
    </AutoFilterForm>
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
        <section className="admin-detail-section" aria-labelledby="member-cadastral-title">
          <div className="admin-section-header"><h3 id="member-cadastral-title">{t('cadastralData')}</h3></div>
          <div className="admin-detail-field-grid is-property">{propertyFields.map(renderField)}</div>
          {renderField(['street_address', true])}
          <div className="admin-detail-field-grid is-ownership">{ownershipFields.map(renderField)}</div>
          {selected?.street_address && <MemberPropertyMap streetAddress={selected.street_address} />}
          {canMatrikkelSync && !selected.isNew && <Link className="admin-button admin-detail-section-action" href={`/admin/members/matrikkel?member=${encodeURIComponent(selected.id)}`}>{t('updateMember')}</Link>}
        </section>
        <section className="admin-detail-section" aria-labelledby="member-contact-title">
          <div className="admin-section-header"><h3 id="member-contact-title">{t('contactInformation')}</h3></div>
          {contactFields.map(renderField)}
        </section>
        <section className="admin-detail-section" aria-labelledby="member-affiliations-title">
          <div className="admin-section-header"><h3 id="member-affiliations-title">{t('statusAndAffiliations')}</h3></div>
          <label>{t('membershipStatus')}<Select value={form.membership_status || 'member'} onChange={(event) => updateForm('membership_status', event.target.value)}><option value="member">{t('regularMember')}</option><option value="exempt">{t('exemptMembership')}</option></Select></label>
          <label className="admin-checkbox"><input type="checkbox" checked={Boolean(form.turufjell_as_sharing_opt_out)} onChange={(event) => updateForm('turufjell_as_sharing_opt_out', event.target.checked)} /> {t('optOut')}</label><span className="admin-field-note">{t('optOutNote')}</span>
          <section aria-label={t('sharedProperties')}>{selected.shared_email_groups?.map((group) => <details key={group.email}><summary>{group.email} · {t('propertyCount', {count: group.properties.length})}</summary><ul>{group.properties.map((property) => <li key={property.id}><Link href={`/admin/members?member=${encodeURIComponent(property.id)}`}>{property.h_number} · {property.contact_name || t('contactMissing')} · {property.street_address || t('addressMissing')}</Link></li>)}</ul></details>)}</section>
          {!selected.isNew && <section className="member-group-memberships" aria-labelledby="member-group-memberships-title">
            <div className="admin-section-header"><div><p className="eyebrow">{t('groupMembershipsEyebrow')}</p><h3 id="member-group-memberships-title">{t('groupMemberships')}</h3></div></div>
            <label>{t('hamlet')}<Select value={selected.hamlet_id || ''} onChange={(event) => changeSelectedHamlet(event.target.value)} disabled={Boolean(groupBusy) || data.mock}><option value="">{t('notLinked')}</option>{hamlets.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</Select></label>
            <span className="admin-field-note">{t('hamletMapNote')} <Link href="/admin/map">{t('editHamletInMap')}</Link></span>
            <fieldset className="member-email-group-list" disabled={Boolean(groupBusy) || data.mock}><legend>{t('emailGroups')}</legend>
              {emailGroups.length ? emailGroups.map((group) => {
                const checkedInGroup = (selected.email_group_ids || []).map(String).includes(String(group.id));
                return <label className="admin-checkbox" key={group.id}><input type="checkbox" checked={checkedInGroup} onChange={(event) => changeGroupMembership(group, event.target.checked ? 'add' : 'remove', [selected.id], `detail-${group.id}`)} /> {group.name}</label>;
              }) : <p>{t('noEmailGroups')}</p>}
            </fieldset>
            {groupMessage && <p className={groupMessage.type === 'error' ? 'form-error' : 'admin-success'} role="status">{groupMessage.text}</p>}
          </section>}
        </section>
        {newToken && <p className="admin-success">{t('memberId', {id: newToken})}</p>}{message && <p className={saveState === 'error' ? 'form-error' : 'admin-success'} role="status">{message}</p>}
        <button className="primary-button" type="submit" disabled={saving || data.mock}>{saving ? t('saving') : selected.isNew ? t('createMember') : t('saveNow')}</button>{!selected.isNew && <button className="admin-delete" type="button" onClick={() => setConfirmDelete(true)} disabled={data.mock}>{t('delete')}</button>}{data.mock && <p className="privacy-subnote">{t('mockReadonly')}</p>}
      </form>}
    </aside>
    <ConfirmDialog open={confirmDelete} title={t('deleteTitle', {id: selected?.h_number || ''})} description={t('deleteDescription')} confirmLabel={t('delete')} busy={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
    {exportOpen && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title"><p className="eyebrow">{t('exportEyebrow')}</p><h2 id="export-title">{t('exportTitle')}</h2><form className="export-form" onSubmit={exportMembers}>
      <fieldset><legend>{t('exportMembers')}</legend><label><input type="radio" name="export-scope" value="all" checked={exportScope === 'all'} onChange={() => setExportScope('all')} /> {t('exportAll')}</label><label><input type="radio" name="export-scope" value="selected" checked={exportScope === 'selected'} onChange={() => setExportScope('selected')} disabled={!checked.size} /> {t('exportSelected', {count: checked.size})}</label></fieldset>
      <label className="admin-checkbox"><input type="checkbox" checked={excludeTurufjellAsOptOut} onChange={(event) => setExcludeTurufjellAsOptOut(event.target.checked)} /> {t('excludeOptOut')}</label>
      <label htmlFor="export-survey">{t('survey')}<Select id="export-survey" value={exportSurveyId} onChange={(event) => setExportSurveyId(event.target.value)} required>{surveys.map((survey) => <option value={survey.id} key={survey.id}>{survey.title}{survey.has_ended ? t('ended') : survey.is_open ? '' : t('closed')}</option>)}</Select></label>
      <p className="privacy-subnote">{t('exportPrivacy')}</p>{exportMessage && <p className="form-error" role="alert">{exportMessage}</p>}<div className="confirm-actions"><button ref={exportCancelButton} className="admin-button" type="button" onClick={() => setExportOpen(false)} disabled={exporting}>{t('cancel')}</button><button className="primary-button" type="submit" disabled={exporting || !exportSurveyId || (exportScope === 'selected' && !checked.size)}>{exporting ? t('generating') : t('download')}</button></div>
    </form></section></div>}
  </>;
}

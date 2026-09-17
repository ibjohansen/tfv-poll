'use client';

import Select from "@/components/Select";
import { useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useI18n } from '@/components/LocaleProvider';

function memberLabel(member, t) {
  return `${member.h_number} · ${member.street_address || t('addressMissing')}`;
}

export default function MatrikkelSyncPanel({ initialRuns, members = [], initialMemberId = '', initialMemberIds = [], configured, databaseReady }) {
  const { t, formatLocale } = useI18n('members.matrikkel');
  const [runs, setRuns] = useState(initialRuns);
  const [activeId, setActiveId] = useState(initialRuns.find((run) => ['pending', 'running'].includes(run.status))?.id || null);
  const [active, setActive] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [scope, setScope] = useState('all');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState(initialMemberId);
  const [selectedMemberIds, setSelectedMemberIds] = useState(initialMemberIds);
  const [starting, setStarting] = useState(false);
  const [processingLocally, setProcessingLocally] = useState(false);
  const [message, setMessage] = useState('');
  const selectedMember = members.find((member) => member.id === selectedMemberId) || null;
  const memberQuery = memberSearch.trim().toLocaleLowerCase('nb-NO');
  const matchingMembers = memberQuery ? members.filter((member) => [member.h_number, member.street_address, member.cadastral_number]
    .some((value) => String(value || '').toLocaleLowerCase('nb-NO').includes(memberQuery))) : members;
  const visibleMembers = selectedMember && !matchingMembers.some((member) => member.id === selectedMember.id)
    ? [selectedMember, ...matchingMembers] : matchingMembers;

  useEffect(() => {
    if (!activeId) return undefined;
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/admin/matrikkel/runs?id=${activeId}`, { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message);
        if (stopped) return;
        setActive(body.data);
        setRuns((current) => [body.data, ...current.filter((run) => run.id !== body.data.id)].slice(0, 10));
        if (['completed', 'failed', 'cancelled'].includes(body.data.status)) setActiveId(null);
      } catch (error) { if (!stopped) setMessage(error.message || t('statusError')); }
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [activeId, t]);

  async function processNext(runId) {
    setProcessingLocally(true);
    try {
      let status = 'running';
      while (['pending', 'running'].includes(status)) {
        const response = await fetch(`/api/admin/matrikkel/runs/${runId}/process`, { method: 'POST' });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message);
        status = body.run.status;
        setActive(body.run);
      }
    } catch (error) { setMessage(error.message || t('stopped')); }
    finally { setProcessingLocally(false); }
  }

  async function start() {
    setStarting(true); setMessage('');
    try {
      const input = { hNumber: scope === 'test' ? '25' : null, memberId: scope === 'member' ? selectedMemberId : null };
      if (scope === 'selection') input.memberIds = selectedMemberIds;
      const response = await fetch('/api/admin/matrikkel/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const body = await response.json();
      const isFinished = ['completed', 'failed', 'cancelled'].includes(body.run?.status);
      if (body.run) {
        setConfirm(false); setActiveId(isFinished ? null : body.run.id); setActive(body.run);
        setRuns((current) => [body.run, ...current.filter((run) => run.id !== body.run.id)].slice(0, 10));
      }
      if (!response.ok || !body.ok) throw new Error(body.message);
      if (!body.backgroundStarted && !isFinished) processNext(body.run.id);
    } catch (error) { setConfirm(false); setMessage(error.message || t('startError')); }
    finally { setStarting(false); }
  }

  async function approve(item) {
    setMessage('');
    try {
      const response = await fetch(`/api/admin/matrikkel/runs/${active.id}/items/${item.member_id}/approve`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message);
      const detailResponse = await fetch(`/api/admin/matrikkel/runs?id=${active.id}`, { cache: 'no-store' });
      const detail = await detailResponse.json();
      if (!detailResponse.ok || !detail.ok) throw new Error(detail.message);
      setActive(detail.data);
      setRuns((current) => [detail.data, ...current.filter((run) => run.id !== detail.data.id)].slice(0, 10));
    } catch (error) { setMessage(error.message || t('approveError')); }
  }

  async function stop() {
    if (!activeId) return;
    setStarting(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/matrikkel/runs/${activeId}?action=cancel`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message);
      setActive(body.run);
      setRuns((current) => [body.run, ...current.filter((run) => run.id !== body.run.id)].slice(0, 10));
      setActiveId(null); setConfirmStop(false);
    } catch (error) { setConfirmStop(false); setMessage(error.message || t('stopError')); }
    finally { setStarting(false); }
  }

  async function removeRun() {
    if (!deleteCandidate) return;
    setStarting(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/matrikkel/runs/${deleteCandidate.id}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message);
      setRuns((current) => current.filter((run) => run.id !== deleteCandidate.id));
      if (active?.id === deleteCandidate.id) setActive(null);
      setDeleteCandidate(null);
    } catch (error) { setDeleteCandidate(null); setMessage(error.message || t('removeError')); }
    finally { setStarting(false); }
  }

  const current = active || runs[0];
  const currentMember = members.find((member) => member.id === current?.selected_member_id);
  const currentScope = currentMember ? memberLabel(currentMember, t) : current?.h_number_filter ? t('hNumber', {number: current.h_number_filter})
    : current?.total_count < members.length ? t('selectedScope', {count: current.total_count}) : t('allMembers');
  return <>
    <section className="matrikkel-intro"><div><p>{t('intro')}</p><p>{t('backupIntro')}</p></div><div className="matrikkel-actions"><button className="admin-button" type="button" onClick={() => { setScope('test'); setConfirm(true); }} disabled={!configured || !databaseReady || starting || processingLocally || Boolean(activeId)}>{t('test')}</button><button className="primary-button" type="button" onClick={() => { setScope('all'); setConfirm(true); }} disabled={!configured || !databaseReady || starting || processingLocally || Boolean(activeId)}>{activeId || processingLocally ? t('syncing') : t('syncAll')}</button>{activeId && <button className="admin-button" type="button" onClick={() => setConfirmStop(true)} disabled={starting}>{t('stop')}</button>}</div></section>
    {selectedMemberIds.length > 0 && <section className="matrikkel-selection" aria-label={t('selectedRegion')}><div><p className="eyebrow">{t('selectedEyebrow')}</p><h2>{t('selectedTitle', {count: selectedMemberIds.length})}</h2><p>{t('selectedHelp')}</p></div><div className="map-actions"><button className="primary-button" type="button" onClick={() => { setScope('selection'); setConfirm(true); }} disabled={!configured || !databaseReady || starting || processingLocally || Boolean(activeId)}>{t('updateSelected')}</button><button className="admin-button" type="button" onClick={() => setSelectedMemberIds([])} disabled={starting}>{t('clearSelection')}</button></div></section>}
    <section className="matrikkel-member-picker" aria-labelledby="matrikkel-member-title"><div><p className="eyebrow">{t('single')}</p><h2 id="matrikkel-member-title">{t('chooseTitle')}</h2><p>{t('chooseHelp')}</p></div><div className="matrikkel-member-fields"><label>{t('search')}<input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={t('searchPlaceholder')} maxLength={100} /></label><div className="select-action-row"><label>{t('member')}<Select value={selectedMemberId} onChange={(event) => { setSelectedMemberId(event.target.value); setSelectedMemberIds([]); }}><option value="">{t('choose')}</option>{visibleMembers.map((member) => <option key={member.id} value={member.id}>{memberLabel(member, t)}{member.cadastral_number ? ` · ${member.cadastral_number}` : ''}</option>)}</Select></label><button className="primary-button" type="button" onClick={() => { setScope('member'); setConfirm(true); }} disabled={!selectedMember || !configured || !databaseReady || starting || processingLocally || Boolean(activeId)}>{t('updateMember')}</button></div>{memberSearch && !visibleMembers.length && <p className="form-error" role="status">{t('noResults')}</p>}</div></section>
    {!configured && <p className="form-error" role="alert">{t('apiMissing')}</p>}
    {!databaseReady && <p className="form-error" role="alert">{t('databaseMissing')}</p>}
    {message && <p className="form-error" role="alert">{message}</p>}
    {current && <section className="matrikkel-status" aria-live="polite"><div><p className="eyebrow">{t('latest', {scope: currentScope})}</p><h2>{t(`statuses.${current.status}`, {}, current.status)}</h2><p>{t('startedBy', {user: current.requested_by})}</p></div><dl><div><dt>{t('processed')}</dt><dd>{current.processed_count || 0} / {current.total_count || 0}</dd></div><div><dt>{t('updated')}</dt><dd>{current.updated_count || 0}</dd></div><div><dt>{t('unchanged')}</dt><dd>{current.unchanged_count || 0}</dd></div><div><dt>{t('review')}</dt><dd>{current.review_count || 0}</dd></div><div><dt>{t('errors')}</dt><dd>{current.error_count || 0}</dd></div><div><dt>{t('backedUp')}</dt><dd>{current.backup_count ?? current.total_count ?? 0}</dd></div></dl>{current.error_message && <p className="form-error">{current.error_message}</p>}</section>}
    {active?.items?.length > 0 && <div className="admin-table-scroll" role="region" aria-label={t('deviations')} tabIndex={0}><table className="admin-table"><caption>{t('deviationsCaption')}</caption><thead><tr><th>{t('hNumberLabel')}</th><th>{t('status')}</th><th>{t('address')}</th><th>{t('proposal')}</th><th>{t('message')}</th><th>{t('action')}</th></tr></thead><tbody>{active.items.map((item) => <tr key={item.member_id}><th scope="row">{item.h_number}</th><td>{item.status}</td><td>{item.source_address || t('missing')}</td><td>{item.proposed_values ? `${item.proposed_values.cadastral_number || ''} · ${item.proposed_values.title_holder || t('noOwner')}` : t('none')}</td><td>{item.message}</td><td>{item.status === 'review' && item.proposed_values && <button className="admin-button" type="button" onClick={() => approve(item)}>{t('approve')}</button>}</td></tr>)}</tbody></table></div>}
    {runs.length > 0 && <section className="matrikkel-history"><h2>{t('history')}</h2><ul>{runs.map((run) => { const date = new Date(run.created_at).toLocaleString(formatLocale); return <li key={run.id}><button className="matrikkel-history-open" type="button" onClick={() => { setActiveId(run.id); setActive(run); }}>{date} · {t(`statuses.${run.status}`, {}, run.status)} · {run.processed_count || 0}/{run.total_count}</button>{!['pending', 'running'].includes(run.status) && <button className="matrikkel-history-delete" type="button" onClick={() => setDeleteCandidate(run)} aria-label={t('removeRun', {date})}>{t('delete')}</button>}</li>; })}</ul></section>}
    <ConfirmDialog open={confirm} title={scope === 'test' ? t('confirmTest') : scope === 'member' ? t('confirmMember', {member: selectedMember ? memberLabel(selectedMember, t) : t('selectedMemberFallback')}) : scope === 'selection' ? t('confirmSelection', {count: selectedMemberIds.length}) : t('confirmAll')} description={scope === 'member' ? t('memberDescription') : scope === 'selection' ? t('selectionDescription') : t('allDescription')} confirmLabel={scope === 'test' ? t('startTest') : scope === 'member' ? t('updateOne') : scope === 'selection' ? t('updateSelection') : t('syncAll')} busy={starting} onCancel={() => setConfirm(false)} onConfirm={start} />
    <ConfirmDialog open={confirmStop} title={t('confirmStop')} description={t('stopDescription')} confirmLabel={t('stop')} busy={starting} onCancel={() => setConfirmStop(false)} onConfirm={stop} />
    <ConfirmDialog open={Boolean(deleteCandidate)} title={t('confirmRemove')} description={t('removeDescription')} confirmLabel={t('removeConfirm')} busy={starting} onCancel={() => setDeleteCandidate(null)} onConfirm={removeRun} />
  </>;
}

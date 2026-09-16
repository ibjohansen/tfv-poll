'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import MemberPropertyMap from '@/components/MemberPropertyMap';

const propertyFields = [['h_number', 'H-nummer', true], ['cadastral_number', 'Gårds- og bruksnummer', true], ['section_number', 'Seksjonsnummer', true]];
const ownershipFields = [['title_holder', 'Hjemmelshaver', true, true], ['registration_date', 'Tinglysningsdato', true, true]];
const contactFields = [['primary_contact_name', 'Kontaktperson'], ['primary_contact_email', 'Hoved-e-post'], ['other_contact_emails', 'Andre e-postadresser'], ['admin_comment', 'Internt notat – ikke synlig for medlem']];
const saveLabels = { saved: 'Alle endringer lagret', dirty: 'Venter på automatisk lagring …', saving: 'Lagrer automatisk …', error: 'Automatisk lagring feilet' };

function emptyToString(value) { return value || ''; }
function displayLines(value) { return emptyToString(value).split(/\s*\/\s*/).join('\n'); }
function fieldLabel(name, label, value) {
  if (name === 'title_holder' && emptyToString(value).includes('/')) return 'Hjemmelshavere';
  if (name === 'registration_date' && emptyToString(value).includes('/')) return 'Tinglysningsdatoer';
  return label;
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
      } catch (error) { setLoadError(error.message || 'Kunne ikke hente flere medlemmer.'); }
      finally { setLoadingMore(false); }
    }, { rootMargin: '240px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeFilters, direction, hasMore, loadingMore, page, search, sort]);
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
      if (!response.ok || !body.ok) { setMessage(body.message || 'Kunne ikke lagre medlemmet.'); setSaveState('error'); return false; }
      const returnedForm = formFromMember(body.member);
      savedPayload.current = payloadKey(returnedForm);
      setMembers((current) => wasNew ? [body.member, ...current] : current.map((item) => String(item.id) === String(body.member.id) ? { ...item, ...body.member } : item));
      setSelected(body.member);
      if (formVersion.current === version) setForm(returnedForm);
      setNewToken(''); setSaveState(formVersion.current === version ? 'saved' : 'dirty');
      setMessage(wasNew ? body.member.hamlet_name
        ? `Medlemmet er opprettet og automatisk koblet til grenden «${body.member.hamlet_name}».`
        : body.member.street_address ? 'Medlemmet er opprettet. Adressen kunne ikke kobles entydig til en kontrollert grend.'
          : 'Medlemmet er opprettet. Legg inn gateadresse for automatisk grendetilknytning.' : '');
      router.refresh();
      return true;
    } catch { setMessage('Kunne ikke kontakte serveren. Kontroller opplysningene før du prøver igjen.'); setSaveState('error'); return false; }
    finally { savingRef.current = false; setSaving(false); }
  }, [router]);
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
      if (!response.ok || !body.ok) { setConfirmDelete(false); setMessage(body.message || 'Kunne ikke slette medlemmet.'); return; }
      setMembers((current) => current.filter((item) => String(item.id) !== String(selected.id)));
      setConfirmDelete(false); close(); router.refresh();
    } catch {
      setConfirmDelete(false); setMessage('Kunne ikke kontakte serveren for å slette medlemmet.');
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
        throw new Error(body.message || 'Kunne ikke generere Excel-filen.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'medlemsregister.xlsx';
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(href);
      setExportOpen(false);
    } catch (error) { setExportMessage(error.message || 'Kunne ikke generere Excel-filen.'); }
    finally { setExporting(false); }
  }
  const renderField = ([name, label, lockedAfterCreation, multiLine]) => { const readOnly = Boolean(lockedAfterCreation && !selected.isNew); return <div className="admin-detail-field" key={name}><label>{fieldLabel(name, label, form[name])}{name === 'admin_comment' || name === 'other_contact_emails' || multiLine ? <textarea value={multiLine ? displayLines(form[name]) : emptyToString(form[name])} onChange={(event) => updateForm(name, event.target.value)} rows={multiLine ? 3 : name === 'admin_comment' ? 5 : 3} readOnly={readOnly} /> : <input value={emptyToString(form[name])} onChange={(event) => updateForm(name, event.target.value)} required={name === 'h_number'} readOnly={readOnly} />}{readOnly && <span className="admin-field-note">Skrivebeskyttet etter at medlemmet er opprettet.</span>}{name === 'other_contact_emails' && <span className="admin-field-note">Én e-postadresse per linje. Komma og semikolon støttes også.</span>}</label></div>; };
  const matrikkelSelection = [...checked].join(',');
  return <><div className="admin-toolbar"><Link className="admin-button" href="/admin/members/groups">Grender og e-postgrupper</Link></div>
    <div className="admin-toolbar"><button className="admin-button" type="button" onClick={() => { setExportScope(checked.size ? 'selected' : 'all'); setExportMessage(''); setExportOpen(true); }} disabled={data.mock || !surveys.length}>Eksporter til Excel{checked.size ? ` (${checked.size} valgt)` : ''}</button>{canMatrikkelSync && checked.size > 0 && <Link className="admin-button" href={`/admin/members/matrikkel?members=${encodeURIComponent(matrikkelSelection)}`}>Oppdater matrikkeldata ({checked.size} valgt)</Link>}<button className="primary-button" type="button" onClick={create}>Nytt medlem</button></div><form className="admin-search admin-member-filters" action="/admin/members"><div className="admin-filter-grid"><label>Medlemsstatus<select name="membership" defaultValue={membershipStatus}><option value="">Alle tomter</option><option value="member">Ordinære medlemmer</option><option value="exempt">Unntatt medlemskap</option></select></label><label>Grend<select name="hamlet" defaultValue={hamletId}><option value="">Alle grender</option><option value="unassigned">Uten grend</option>{groups.filter((group) => group.kind === 'hamlet').map((group) => <option value={group.id} key={group.id}>{group.name} ({group.plot_count})</option>)}</select></label><label>E-postgruppe<select name="group" defaultValue={groupId}><option value="">Alle grupper</option>{groups.filter((group) => group.kind === 'email').map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><label>Deling med Turufjell AS<select name="sharing" defaultValue={turufjellAsSharing}><option value="">Alle</option><option value="allowed">Kan tas med</option><option value="opted_out">Reservert</option></select></label></div><fieldset className="admin-filter-toggles"><legend>Vis bare</legend><label><input type="checkbox" name="contact" value="incomplete" defaultChecked={incompleteContact} /> Mangelfull kontaktinfo</label><label><input type="checkbox" name="comment" value="present" defaultChecked={hasComment} /> Medlemmer med kommentar</label></fieldset><label htmlFor="member-search">Søk i medlemsregisteret</label><div><input id="member-search" name="q" type="search" defaultValue={search} placeholder="H-nummer, adresse, navn eller e-post" maxLength={200} /><button className="primary-button" type="submit">Bruk filter</button>{(search || Object.keys(activeFilters).length > 0) && <Link href="/admin/members">Nullstill filter</Link>}</div></form>
    <p className="admin-count" role="status">{data.total} tomter{incompleteContact ? ' med mangelfull hovedkontakt eller hoved-e-post' : ''}{hasComment ? ' med registrert kommentar' : ''}{!incompleteContact && !hasComment && search ? ' funnet' : ''}{data.mock ? ' · Fiktive testdata' : ''}</p>
    {members.length ? <><div className="admin-table-scroll" role="region" aria-label="Medlemmer" tabIndex={0}><table className="admin-table"><caption>Velg medlemmer med avkrysningsboksene, eller velg en rad for å se og redigere medlemsopplysninger. Klikk på en kolonneoverskrift for å sortere.</caption><thead><tr><th className="admin-select-column" scope="col"><span className="visually-hidden">Velg for eksport eller matrikkeloppdatering</span></th><th scope="col"><Link className="admin-sort" href={sortHref('h_number')}>{sortLabel('h_number', 'H-nummer')}</Link></th><th scope="col"><Link className="admin-sort" href={sortHref('street_address')}>{sortLabel('street_address', 'Adresse')}</Link></th><th scope="col"><Link className="admin-sort" href={sortHref('title_holder')}>{sortLabel('title_holder', 'Hjemmelshaver')}</Link></th><th scope="col"><Link className="admin-sort" href={sortHref('primary_contact_email')}>{sortLabel('primary_contact_email', 'Hoved-e-post')}</Link></th><th scope="col">Grend</th><th scope="col">Medlemsstatus</th><th scope="col">Turufjell AS</th>{hasComment && <th scope="col">Internt notat</th>}</tr></thead><tbody>{members.map((member) => <tr className="admin-clickable-row" key={member.id} tabIndex={0} onClick={() => select(member)} onKeyDown={(event) => selectOnKey(event, member, select)}><td className="admin-select-column" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={checked.has(String(member.id))} onChange={() => toggleChecked(member.id)} aria-label={`Velg medlem ${member.h_number} for handlinger`} /></td><th scope="row">{member.h_number}</th><td>{member.street_address || 'Ikke registrert'}</td><td>{member.title_holder || member.primary_contact_name || 'Ikke registrert'}</td><td>{member.primary_contact_email || 'Ikke registrert'}{member.shared_email_groups?.length > 0 && <small className="shared-contact-badge">Deler e-post med andre tomter</small>}</td><td>{member.hamlet_name || 'Ikke tilknyttet'}</td><td>{member.membership_status === 'exempt' ? 'Unntatt medlemskap' : 'Ordinært medlem'}</td><td>{member.turufjell_as_sharing_opt_out ? 'Reservert' : 'Kan tas med'}</td>{hasComment && <td className="admin-comment">{member.admin_comment}</td>}</tr>)}</tbody></table></div><div className="admin-load-more" ref={sentinel} aria-live="polite">{loadingMore ? 'Laster flere medlemmer …' : loadError || (hasMore ? 'Rull ned for å laste flere medlemmer.' : 'Alle medlemmer er lastet.')}</div></> : <p>Ingen medlemmer samsvarer med søket.</p>}
    <aside className={`admin-detail-panel${selected ? ' is-open' : ''}`} aria-hidden={!selected} aria-label="Rediger medlem" onKeyDown={(event) => { if (event.key === 'Escape' && !saving && !confirmDelete) { event.stopPropagation(); close(); } }}><div className="admin-detail-header"><div><p className="eyebrow">{selected?.isNew ? 'Nytt medlem' : 'Medlem'}</p><h2>{selected?.isNew ? 'Opprett medlem' : selected?.h_number}</h2>{!selected?.isNew && <span className={`admin-save-status is-${saveState}`} role="status">{saveLabels[saveState]}</span>}</div><button className="admin-button" type="button" ref={detailCloseButton} onClick={close} disabled={saving}>Lukk</button></div>{form && <form className="admin-detail-form" onSubmit={save}><section aria-label="Tomter med felles e-post">{selected.shared_email_groups?.map((group) => <details key={group.email}><summary>{group.email} · {group.properties.length} tomter</summary><ul>{group.properties.map((property) => <li key={property.id}><Link href={`/admin/members?member=${encodeURIComponent(property.id)}`}>{property.h_number} · {property.contact_name || 'Kontakt ikke registrert'} · {property.street_address || 'Adresse ikke registrert'}</Link></li>)}</ul></details>)}</section>{canMatrikkelSync && !selected.isNew && <Link className="admin-button" href={`/admin/members/matrikkel?member=${encodeURIComponent(selected.id)}`}>Oppdater matrikkeldata for dette medlemmet</Link>}<label>Medlemsstatus<select value={form.membership_status || 'member'} onChange={(event) => updateForm('membership_status', event.target.value)}><option value="member">Ordinært medlem</option><option value="exempt">Unntatt medlemskap</option></select></label><label className="admin-checkbox"><input type="checkbox" checked={Boolean(form.turufjell_as_sharing_opt_out)} onChange={(event) => updateForm('turufjell_as_sharing_opt_out', event.target.checked)} /> Reservert mot deling av kontaktinformasjon med Turufjell AS</label><span className="admin-field-note">Reserverte poster utelates som standard fra Excel-uttrekk til manuell utveksling.</span><div className="admin-detail-field-grid is-property">{propertyFields.map(renderField)}</div>{renderField(['street_address', 'Gateadresse', true])}<div className="admin-detail-field-grid is-ownership">{ownershipFields.map(renderField)}</div>{selected?.street_address && <MemberPropertyMap streetAddress={selected.street_address} />}{contactFields.map(renderField)}{newToken && <p className="admin-success">Medlems-ID: {newToken}</p>}{message && <p className={message.includes('opprettet') ? 'admin-success' : 'form-error'} role="status">{message}</p>}<button className="primary-button" type="submit" disabled={saving || data.mock}>{saving ? 'Lagrer …' : selected.isNew ? 'Opprett medlem' : 'Lagre nå'}</button>{!selected.isNew && <button className="admin-delete" type="button" onClick={() => setConfirmDelete(true)} disabled={data.mock}>Slett medlem</button>}{data.mock && <p className="privacy-subnote">Mock-data kan ikke endres.</p>}</form>}</aside><ConfirmDialog open={confirmDelete} title={`Slette medlem ${selected?.h_number || ''}?`} description="Medlemsdata og eventuelle svar beholdes, men medlemmet skjules og medlemslenken tilbakekalles." confirmLabel="Slett medlem" busy={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
    {exportOpen && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title"><p className="eyebrow">Excel-eksport</p><h2 id="export-title">Eksporter medlemsregister</h2><form className="export-form" onSubmit={exportMembers}><fieldset><legend>Medlemmer</legend><label><input type="radio" name="export-scope" value="all" checked={exportScope === 'all'} onChange={() => setExportScope('all')} /> Alle aktive tomter i valgt medlemsstatus</label><label><input type="radio" name="export-scope" value="selected" checked={exportScope === 'selected'} onChange={() => setExportScope('selected')} disabled={!checked.size} /> Valgte medlemmer ({checked.size})</label></fieldset><label className="admin-checkbox"><input type="checkbox" checked={excludeTurufjellAsOptOut} onChange={(event) => setExcludeTurufjellAsOptOut(event.target.checked)} /> Utelat poster reservert mot deling med Turufjell AS</label><label htmlFor="export-survey">Undersøkelse<select id="export-survey" value={exportSurveyId} onChange={(event) => setExportSurveyId(event.target.value)} required>{surveys.map((survey) => <option value={survey.id} key={survey.id}>{survey.title}{survey.has_ended ? ' (avsluttet)' : survey.is_open ? '' : ' (stengt)'}</option>)}</select></label><p className="privacy-subnote">Reservasjonene utelates som standard. Slå bare av valget når filen skal brukes internt i Turufjell Vel. «Alle» bruker bare valgt medlemsstatus, ikke søk, grend eller e-postgruppe. Filen inneholder medlemsopplysninger, men ingen tilgangstokener eller personlige lenker. Behandle filen som konfidensiell.</p>{exportMessage && <p className="form-error" role="alert">{exportMessage}</p>}<div className="confirm-actions"><button ref={exportCancelButton} className="admin-button" type="button" onClick={() => setExportOpen(false)} disabled={exporting}>Avbryt</button><button className="primary-button" type="submit" disabled={exporting || !exportSurveyId || (exportScope === 'selected' && !checked.size)}>{exporting ? 'Genererer …' : 'Last ned Excel'}</button></div></form></section></div>}
  </>;
}

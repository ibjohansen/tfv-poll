'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import MemberPropertyMap from '@/components/MemberPropertyMap';

const fields = [
  ['h_number', 'H-nummer', true], ['cadastral_number', 'Gårds- og bruksnummer', true], ['section_number', 'Seksjonsnummer', true], ['street_address', 'Gateadresse', true],
  ['title_holder', 'Hjemmelshaver', true, true], ['registration_date', 'Tinglysningsdato', true, true], ['primary_contact_name', 'Kontaktperson'],
  ['primary_contact_email', 'Hoved-e-post'], ['other_contact_emails', 'Andre e-postadresser'], ['admin_comment', 'Internt notat – ikke synlig for medlem'],
];

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

export default function AdminMemberDirectory({ data, surveys, search, sort, direction, incompleteContact, hasComment = false, initialSelected = null, membershipStatus = '', hamletId = '', groupId = '', groups = [] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(initialSelected);
  const [form, setForm] = useState(() => initialSelected ? { ...initialSelected, other_contact_emails: (initialSelected.other_contact_emails || []).join('\n') } : null);
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
  const activeFilters = useMemo(() => ({ ...(incompleteContact ? { contact: 'incomplete' } : {}), ...(hasComment ? { comment: 'present' } : {}), ...(membershipStatus ? { membership: membershipStatus } : {}), ...(hamletId ? { hamlet: hamletId } : {}), ...(groupId ? { group: groupId } : {}) }), [hasComment, incompleteContact, membershipStatus, hamletId, groupId]);
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
  const select = (member) => { detailTrigger.current = document.activeElement; setSelected(member); setForm({ ...member, other_contact_emails: (member.other_contact_emails || []).join('\n') }); setMessage(''); setNewToken(''); };
  const create = () => { setSelected({ isNew: true }); setForm({ h_number: '', cadastral_number: '', section_number: '', street_address: '', title_holder: '', registration_date: '', primary_contact_name: '', primary_contact_email: '', other_contact_emails: '', admin_comment: '' }); setMessage(''); setNewToken(''); };
  const close = () => { setSelected(null); setForm(null); setNewToken(''); };
  async function save(event) {
    event.preventDefault();
    setSaving(true); setMessage('');
    const payload = { ...form, other_contact_emails: form.other_contact_emails.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean) };
    try {
      const response = await fetch(selected.isNew ? '/api/admin/members' : `/api/admin/members/${selected.id}`, { method: selected.isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000) });
      const body = await response.json();
      if (!response.ok || !body.ok) { setMessage(body.message || 'Kunne ikke lagre medlemmet.'); return; }
      setMembers((current) => selected.isNew ? [body.member, ...current] : current.map((item) => String(item.id) === String(body.member.id) ? { ...item, ...body.member } : item));
      setSelected(body.member); setForm({ ...body.member, other_contact_emails: (body.member.other_contact_emails || []).join('\n') }); setNewToken(''); setMessage(selected.isNew ? 'Medlemmet er opprettet.' : 'Lagret.'); router.refresh();
    } catch { setMessage('Kunne ikke kontakte serveren. Kontroller opplysningene før du prøver igjen.'); }
    finally { setSaving(false); }
  }
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
        body: JSON.stringify({ scope: exportScope, membershipStatus, memberIds: [...checked], surveyId: exportSurveyId }),
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
  return <><div className="admin-toolbar"><Link className="admin-button" href="/admin/members/matrikkel">Oppdater matrikkeldata</Link><Link className="admin-button" href="/admin/members/groups">Grender og e-postgrupper</Link><Link className="admin-button" href="/admin/members/newsletters">Nyhetsbrev</Link></div>
    <div className="admin-toolbar"><button className="admin-button" type="button" onClick={() => { setExportScope(checked.size ? 'selected' : 'all'); setExportMessage(''); setExportOpen(true); }} disabled={data.mock || !surveys.length}>Eksporter til Excel{checked.size ? ` (${checked.size} valgt)` : ''}</button><Link className={`admin-button${incompleteContact ? ' is-active' : ''}`} href={`/admin/members?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(membershipStatus ? { membership: membershipStatus } : {}), ...(hamletId ? { hamlet: hamletId } : {}), ...(groupId ? { group: groupId } : {}), ...(hasComment ? { comment: 'present' } : {}), ...(!incompleteContact ? { contact: 'incomplete' } : {}) })}`}>{incompleteContact ? 'Vis alle medlemmer' : 'Vis mangelfull kontaktinfo'}</Link><Link className={`admin-button${hasComment ? ' is-active' : ''}`} href={`/admin/members?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(membershipStatus ? { membership: membershipStatus } : {}), ...(hamletId ? { hamlet: hamletId } : {}), ...(groupId ? { group: groupId } : {}), ...(incompleteContact ? { contact: 'incomplete' } : {}), ...(!hasComment ? { comment: 'present' } : {}) })}`}>{hasComment ? 'Vis også uten kommentar' : 'Vis medlemmer med kommentar'}</Link><button className="primary-button" type="button" onClick={create}>Nytt medlem</button></div><form className="admin-search" action="/admin/members"><label>Medlemsstatus<select name="membership" defaultValue={membershipStatus}><option value="">Alle tomter</option><option value="member">Ordinære medlemmer</option><option value="exempt">Unntatt medlemskap</option></select></label><label>Grend<select name="hamlet" defaultValue={hamletId}><option value="">Alle grender</option>{groups.filter((group) => group.kind === 'hamlet').map((group) => <option value={group.id} key={group.id}>{group.name} ({group.plot_count})</option>)}</select></label><label>E-postgruppe<select name="group" defaultValue={groupId}><option value="">Alle grupper</option>{groups.filter((group) => group.kind === 'email').map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><label htmlFor="member-search">Søk i medlemsregisteret</label>{incompleteContact && <input type="hidden" name="contact" value="incomplete" />}{hasComment && <input type="hidden" name="comment" value="present" />}<div><input id="member-search" name="q" type="search" defaultValue={search} placeholder="H-nummer, adresse, navn eller e-post" maxLength={200} /><button className="primary-button" type="submit">Søk</button>{search && <Link href={`/admin/members?${new URLSearchParams(activeFilters)}`}>Nullstill søket</Link>}</div></form>
    <p className="admin-count" role="status">{data.total} tomter{incompleteContact ? ' med mangelfull hovedkontakt eller hoved-e-post' : ''}{hasComment ? ' med registrert kommentar' : ''}{!incompleteContact && !hasComment && search ? ' funnet' : ''}{data.mock ? ' · Fiktive testdata' : ''}</p>
    {members.length ? <><div className="admin-table-scroll" role="region" aria-label="Medlemmer" tabIndex={0}><table className="admin-table"><caption>Velg medlemmer med avkrysningsboksene, eller velg en rad for å se og redigere medlemsopplysninger. Klikk på en kolonneoverskrift for å sortere.</caption><thead><tr><th className="admin-select-column" scope="col"><span className="visually-hidden">Velg for eksport</span></th><th scope="col"><Link className="admin-sort" href={sortHref('h_number')}>{sortLabel('h_number', 'H-nummer')}</Link></th><th scope="col"><Link className="admin-sort" href={sortHref('street_address')}>{sortLabel('street_address', 'Adresse')}</Link></th><th scope="col"><Link className="admin-sort" href={sortHref('title_holder')}>{sortLabel('title_holder', 'Hjemmelshaver')}</Link></th><th scope="col"><Link className="admin-sort" href={sortHref('primary_contact_email')}>{sortLabel('primary_contact_email', 'Hoved-e-post')}</Link></th><th scope="col">Grend</th><th scope="col">Medlemsstatus</th>{hasComment && <th scope="col">Internt notat</th>}</tr></thead><tbody>{members.map((member) => <tr className="admin-clickable-row" key={member.id} tabIndex={0} onClick={() => select(member)} onKeyDown={(event) => selectOnKey(event, member, select)}><td className="admin-select-column" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={checked.has(String(member.id))} onChange={() => toggleChecked(member.id)} aria-label={`Velg medlem ${member.h_number} for eksport`} /></td><th scope="row">{member.h_number}</th><td>{member.street_address || 'Ikke registrert'}</td><td>{member.title_holder || member.primary_contact_name || 'Ikke registrert'}</td><td>{member.primary_contact_email || 'Ikke registrert'}{member.shared_email_groups?.length > 0 && <small className="shared-contact-badge">Deler e-post med andre tomter</small>}</td><td>{member.hamlet_name || 'Ikke tilknyttet'}</td><td>{member.membership_status === 'exempt' ? 'Unntatt medlemskap' : 'Ordinært medlem'}</td>{hasComment && <td className="admin-comment">{member.admin_comment}</td>}</tr>)}</tbody></table></div><div className="admin-load-more" ref={sentinel} aria-live="polite">{loadingMore ? 'Laster flere medlemmer …' : loadError || (hasMore ? 'Rull ned for å laste flere medlemmer.' : 'Alle medlemmer er lastet.')}</div></> : <p>Ingen medlemmer samsvarer med søket.</p>}
    <aside className={`admin-detail-panel${selected ? ' is-open' : ''}`} aria-hidden={!selected} aria-label="Rediger medlem" onKeyDown={(event) => { if (event.key === 'Escape' && !saving && !confirmDelete) { event.stopPropagation(); close(); } }}><div className="admin-detail-header"><div><p className="eyebrow">{selected?.isNew ? 'Nytt medlem' : 'Medlem'}</p><h2>{selected?.isNew ? 'Opprett medlem' : selected?.h_number}</h2></div><button className="admin-button" type="button" ref={detailCloseButton} onClick={close}>Lukk</button></div>{form && <form className="admin-detail-form" onSubmit={save}><section aria-label="Tomter med felles e-post">{selected.shared_email_groups?.map((group) => <details key={group.email}><summary>{group.email} · {group.properties.length} tomter</summary><ul>{group.properties.map((property) => <li key={property.id}><Link href={`/admin/members?member=${encodeURIComponent(property.id)}`}>{property.h_number} · {property.contact_name || 'Kontakt ikke registrert'} · {property.street_address || 'Adresse ikke registrert'}</Link></li>)}</ul></details>)}</section><label>Medlemsstatus<select value={form.membership_status || 'member'} onChange={(event) => setForm({ ...form, membership_status: event.target.value })}><option value="member">Ordinært medlem</option><option value="exempt">Unntatt medlemskap</option></select></label>{fields.map(([name, label, lockedAfterCreation, multiLine]) => { const readOnly = Boolean(lockedAfterCreation && !selected.isNew); return <div className="admin-detail-field" key={name}><label>{fieldLabel(name, label, form[name])}{name === 'admin_comment' || name === 'other_contact_emails' || multiLine ? <textarea value={multiLine ? displayLines(form[name]) : emptyToString(form[name])} onChange={(event) => setForm({ ...form, [name]: event.target.value })} rows={multiLine ? 3 : name === 'admin_comment' ? 5 : 3} readOnly={readOnly} /> : <input value={emptyToString(form[name])} onChange={(event) => setForm({ ...form, [name]: event.target.value })} required={name === 'h_number'} readOnly={readOnly} />}{readOnly && <span className="admin-field-note">Skrivebeskyttet etter at medlemmet er opprettet.</span>}{name === 'other_contact_emails' && <span className="admin-field-note">Én e-postadresse per linje. Komma og semikolon støttes også.</span>}</label>{name === 'street_address' && selected?.street_address && <MemberPropertyMap streetAddress={selected.street_address} />}</div>; })}{newToken && <p className="admin-success">Medlems-ID: {newToken}</p>}{message && <p className={message.includes('Lagret') || message.includes('opprettet') ? 'admin-success' : 'form-error'} role="status">{message}</p>}<button className="primary-button" type="submit" disabled={saving || data.mock}>{saving ? 'Lagrer …' : selected.isNew ? 'Opprett medlem' : 'Lagre endringer'}</button>{!selected.isNew && <button className="admin-delete" type="button" onClick={() => setConfirmDelete(true)} disabled={data.mock}>Slett medlem</button>}{data.mock && <p className="privacy-subnote">Mock-data kan ikke endres.</p>}</form>}</aside><ConfirmDialog open={confirmDelete} title={`Slette medlem ${selected?.h_number || ''}?`} description="Medlemsdata og eventuelle svar beholdes, men medlemmet skjules og medlemslenken tilbakekalles." confirmLabel="Slett medlem" busy={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
    {exportOpen && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title"><p className="eyebrow">Excel-eksport</p><h2 id="export-title">Eksporter medlemsregister</h2><form className="export-form" onSubmit={exportMembers}><fieldset><legend>Medlemmer</legend><label><input type="radio" name="export-scope" value="all" checked={exportScope === 'all'} onChange={() => setExportScope('all')} /> Alle aktive tomter i valgt medlemsstatus</label><label><input type="radio" name="export-scope" value="selected" checked={exportScope === 'selected'} onChange={() => setExportScope('selected')} disabled={!checked.size} /> Valgte medlemmer ({checked.size})</label></fieldset><label htmlFor="export-survey">Undersøkelse<select id="export-survey" value={exportSurveyId} onChange={(event) => setExportSurveyId(event.target.value)} required>{surveys.map((survey) => <option value={survey.id} key={survey.id}>{survey.title}{survey.has_ended ? ' (avsluttet)' : survey.is_open ? '' : ' (stengt)'}</option>)}</select></label><p className="privacy-subnote">«Alle» bruker bare valgt medlemsstatus, ikke søk, grend eller e-postgruppe. Bruk «Valgte medlemmer» for et avgrenset uttrekk. Filen inneholder medlemsopplysninger, men ingen tilgangstokener eller personlige lenker. Behandle filen som konfidensiell.</p>{exportMessage && <p className="form-error" role="alert">{exportMessage}</p>}<div className="confirm-actions"><button ref={exportCancelButton} className="admin-button" type="button" onClick={() => setExportOpen(false)} disabled={exporting}>Avbryt</button><button className="primary-button" type="submit" disabled={exporting || !exportSurveyId || (exportScope === 'selected' && !checked.size)}>{exporting ? 'Genererer …' : 'Last ned Excel'}</button></div></form></section></div>}
  </>;
}

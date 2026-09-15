'use client';

import { useState } from 'react';
import Link from 'next/link';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function AdminMemberGroups({ initialGroups }) {
  const [groups, setGroups] = useState(initialGroups);
  const [selected, setSelected] = useState(null);
  const [kind, setKind] = useState('hamlet');
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [checked, setChecked] = useState([]);
  const [allMatching, setAllMatching] = useState(false);
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
      if (!refreshed.ok) throw new Error('Endringen er lagret, men oversikten kunne ikke oppdateres. Last siden på nytt.');
      setGroups((await refreshed.json()).groups);
      if (values.action === 'create') { setSelected({ ...body.group, kind: values.kind }); setRename(body.group.name); setName(''); }
      if (values.action === 'rename') setSelected((current) => ({ ...current, name: values.name }));
      if (values.action === 'delete') { setSelected(null); setConfirmDelete(false); }
      setMessage(`Lagret.${body.group.changed_count !== undefined ? ` ${body.group.changed_count} tomter behandlet.` : ''}`);
    } catch (error) { setMessage(error.message || 'Kunne ikke kontakte serveren.'); }
    finally { setBusy(false); }
  }
  async function findMembers(nextPage = 1) {
    setBusy(true); setMessage('');
    try {
      const currentQuery = nextPage === 1 ? search.trim() : query;
      const response = await fetch(`/api/admin/members?${new URLSearchParams({ q: currentQuery, page: String(nextPage) })}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Kunne ikke hente tomter.');
      const body = await response.json();
      setMembers((current) => nextPage === 1 ? body.members : [...current, ...body.members]);
      setTotal(body.total); setPage(body.page); setQuery(currentQuery);
      if (nextPage === 1) { setChecked([]); setAllMatching(false); }
    } catch (error) { setMessage(error.message || 'Kunne ikke kontakte serveren.'); }
    finally { setBusy(false); }
  }
  const count = allMatching ? total : checked.length;
  return <div className="member-groups-layout">
    <Link className="admin-button" href="/admin/members">Til medlemsregisteret</Link>
    <p>En tomt kan tilhøre én grend og flere e-postgrupper. E-posttelling gjelder unike adresser for ordinære medlemmer, før kontroll av eventuelle leveringsreservasjoner.</p>
    <form className="admin-detail-form" onSubmit={(event) => { event.preventDefault(); change({ kind, action: 'create', name }); }}>
      <h2>Opprett gruppering</h2><label>Type<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="hamlet">Grend</option><option value="email">E-postgruppe</option></select></label>
      <label>Navn<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></label>
      <button type="submit" className="primary-button" disabled={busy}>Opprett</button>
    </form>
    <div className="admin-table-scroll" role="region" aria-label="Gruppeoversikt" tabIndex={0}><table className="admin-table"><caption>Grender og e-postgrupper</caption><thead><tr><th>Navn</th><th>Type</th><th>Tomter</th><th>Medlemstomter</th><th>Unike e-poster</th></tr></thead>
      <tbody>{groups.map((group) => <tr key={`${group.kind}-${group.id}`}><td><button type="button" className="admin-button" disabled={busy} onClick={() => { setSelected(group); setRename(group.name); }}>{group.name}</button></td><td>{group.kind === 'hamlet' ? 'Grend' : 'E-postgruppe'}</td><td>{group.plot_count}</td><td>{group.member_count}</td><td>{group.email_count}</td></tr>)}</tbody>
    </table></div>
    {selected && <section aria-label="Rediger gruppering" className="member-profile-section">
      <h2>{selected.name}</h2><Link href={`/admin/members?${selected.kind === 'hamlet' ? 'hamlet' : 'group'}=${selected.id}`}>Vis tilknyttede tomter i registeret</Link>
      <form className="admin-detail-form" onSubmit={(event) => { event.preventDefault(); change({ ...selected, action: 'rename', name: rename }); }}>
        <label>Nytt navn<input value={rename} onChange={(event) => setRename(event.target.value)} maxLength={100} required /></label><button className="admin-button" disabled={busy}>Endre navn</button>
      </form>
      <form className="admin-search" onSubmit={(event) => { event.preventDefault(); findMembers(); }}><label htmlFor="group-member-search">Søk etter tomter</label><div><input id="group-member-search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={200} /><button className="admin-button" disabled={busy}>Finn tomter</button></div></form>
      {page > 0 && <><label><input type="checkbox" checked={allMatching} onChange={(event) => { setAllMatching(event.target.checked); setChecked([]); }} disabled={busy} /> Velg alle {total} treff for «{query || 'alle tomter'}»</label>
        <ul className="member-group-selection">{members.map((member) => <li key={member.id}><label><input type="checkbox" checked={allMatching || checked.includes(String(member.id))} disabled={busy || allMatching} onChange={(event) => setChecked((current) => event.target.checked ? [...current, String(member.id)] : current.filter((id) => id !== String(member.id)))} />{member.h_number} · {member.street_address || 'Ingen adresse'} · {member.primary_contact_name || 'Ingen kontakt'}</label></li>)}</ul>
        {members.length < total && <button type="button" className="admin-button" onClick={() => findMembers(page + 1)} disabled={busy}>Vis flere tomter</button>}
        <p>{count} tomter valgt. {selected.kind === 'hamlet' && 'Ved tilordning flyttes tomtene fra eventuell tidligere grend.'}</p>
        <button type="button" className="primary-button" disabled={busy || !count} onClick={() => change({ ...selected, action: 'add', memberIds: checked, allMatching, search: query })}>Legg til / flytt valgte</button>{' '}
        <button type="button" className="admin-button" disabled={busy || !count} onClick={() => change({ ...selected, action: 'remove', memberIds: checked, allMatching, search: query })}>Fjern valgte fra gruppen</button>
      </>}
      <p><button type="button" className="admin-delete" disabled={busy} onClick={() => setConfirmDelete(true)}>Slett grupperingen</button></p>
    </section>}
    {message && <p role="status">{message}</p>}
    <ConfirmDialog open={confirmDelete} title={`Slette ${selected?.name || 'grupperingen'}?`} description="Bare grupperingen og tilknytningene fjernes. Ingen medlemsdata slettes. Endringen loggføres." confirmLabel="Slett gruppering" busy={busy} onCancel={() => setConfirmDelete(false)} onConfirm={() => change({ ...selected, action: 'delete' })} />
  </div>;
}

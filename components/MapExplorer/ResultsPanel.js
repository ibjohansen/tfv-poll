'use client';

import { useState } from 'react';
import { addressLabel, normalizeAddress, propertyLabel, sortAddresses } from '@/lib/map/normalization';
import { COMPARISON_STATUSES, STATUS_LABELS } from '@/lib/map/comparison';

function ResultTable({ columns, rows, onSelect, caption }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / 100));
  const currentPage = Math.min(page, pages);
  return <div>
    <div className="map-table-scroll" tabIndex={0} role="region" aria-label={caption}><table className="map-results-table">
      <caption>{caption} · {rows.length} treff</caption>
      <thead><tr>{columns.map(([title]) => <th key={title} scope="col">{title}</th>)}</tr></thead>
      <tbody>{rows.slice((currentPage - 1) * 100, currentPage * 100).map((row) => <tr key={row.id}>{columns.map(([title, render], index) =>
        <td key={title}>{index === 0 ? <button type="button" className="map-row-link" onClick={() => onSelect(row)}>{render(row) || 'Uten navn'}</button> : render(row)}</td>)}</tr>)}</tbody>
    </table></div>
    {!rows.length && <p>Ingen treff i dette utvalget.</p>}
    {pages > 1 && <div className="map-actions"><button type="button" className="admin-button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Forrige</button>
      <span>Side {currentPage} av {pages}</span><button type="button" className="admin-button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Neste</button></div>}
  </div>;
}

export default function ResultsPanel({ addresses, properties, roads, comparison, onSelect }) {
  const [tab, setTab] = useState('addresses');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('');
  const [descending, setDescending] = useState(false);
  const search = normalizeAddress(filter);
  const includes = (values) => normalizeAddress(values.filter(Boolean).join(' ')).includes(search);
  const tabs = [['addresses', 'Adresser'], ['properties', 'Eiendomsreferanser'], ['roads', 'Veier og stier'], ['comparison', 'Registerkontroll']];
  return <section className="map-results" aria-label="Kartresultater">
    <nav className="map-actions" aria-label="Resultatvisning">{tabs.map(([key, label]) => <button type="button" className="admin-button" aria-pressed={tab === key} key={key} onClick={() => { setTab(key); setFilter(''); }}>{label}</button>)}</nav>
    <div className="map-actions"><label>Søk i resultater <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
      {tab === 'addresses' && <label>Sortering <select value={descending ? 'desc' : 'asc'} onChange={(event) => setDescending(event.target.value === 'desc')}><option value="asc">Gatenavn og husnummer A–Å</option><option value="desc">Gatenavn og husnummer Å–A</option></select></label>}
      {tab === 'comparison' && <label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Alle statuser</option>{COMPARISON_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label>}
    </div>
    {tab === 'addresses' && (addresses ? <ResultTable key={`addresses:${filter}:${descending}`} caption="Offisielle adresser fra Kartverket" rows={sortAddresses(addresses, descending).filter((a) => includes([addressLabel(a), propertyLabel(a), a.postalCode]))} onSelect={onSelect}
      columns={[["Adresse", addressLabel], ['Gnr/Bnr', propertyLabel], ['Postnr.', (a) => a.postalCode || '–'], ['Poststed', (a) => a.postalPlace || '–'], ['Kilde', (a) => a.source]]} /> : <p>Velg «Hent adresser» etter at polygonet er tegnet.</p>)}
    {tab === 'properties' && <>
      <p>Referanser fra adresse-API-et. Punktene viser adressenes plassering, ikke eiendommens utstrekning. Ubebygde eiendommer uten adresse er ikke med. Seksjoner og eiendomsgrenser er ikke hentet.</p>
      <ResultTable key={`properties:${filter}`} caption="Eiendomsreferanser knyttet til adressene" rows={(properties || []).filter((p) => includes([p.label, ...p.addresses.map(addressLabel)]))}
        onSelect={(p) => onSelect({ ...p, kind: 'property', name: p.label })}
        columns={[["Gnr/Bnr", (p) => p.label], ['Adresser', (p) => p.addresses.map(addressLabel).join(' · ')], ['Fnr.', (p) => p.fnr ?? '–'], ['Snr.', (p) => p.snr ?? 'Ikke tilgjengelig'], ['Kilde', (p) => p.source]]} />
    </>}
    {tab === 'roads' && (roads ? <ResultTable key={`roads:${filter}`} caption="Supplerende veier og stier – ikke offisiell veifortegnelse" rows={roads.filter((r) => includes([r.name, r.roadType, r.reference]))} onSelect={onSelect}
      columns={[["Navn", (r) => r.name || 'Uten navn'], ['Type', (r) => r.roadType || '–'], ['Lengde i polygon', (r) => `${Math.round(r.lengthMeters).toLocaleString('nb-NO')} m`], ['Referanse', (r) => r.reference || '–'], ['Kilde', (r) => r.source]]} /> : <p>Velg «Hent veier og stier» for å laste veigeometri.</p>)}
    {tab === 'comparison' && (comparison ? <>
      <p>{comparison.scope} «Uten treff» er ikke bevis på en feil: eiendommen kan ligge utenfor polygonet.</p>
      <ResultTable key={`comparison:${filter}:${status}`} caption="Offisielle data sammenlignet med Turufjell vels interne register" rows={comparison.rows.filter((r) => (!status || r.status === status) && includes([...r.officialAddresses.map(addressLabel), r.register?.address, r.register?.hNumber, ...r.notes]))}
        onSelect={(row) => onSelect({ ...row, kind: 'comparison', source: 'Turufjell vel / Kartverket', feature: row.officialAddresses[0]?.feature })}
        columns={[["Offisiell adresse", (r) => r.officialAddresses.map(addressLabel).join(' | ') || r.register?.address || 'Adresse mangler'],
          ['H-nr', (r) => r.register?.hNumber || '–'], ['Adresse i register', (r) => r.register?.address || '–'],
          ['Kartverket: Gnr/Bnr', (r) => r.officialAddresses.map(propertyLabel).join(' | ') || '–'], ['Register: Gnr/Bnr', (r) => r.register ? propertyLabel(r.register) : '–'],
          ['Status', (r) => <span className={`map-status is-${r.status.toLowerCase()}`}>{r.status}<br />{STATUS_LABELS[r.status]}</span>], ['Merknad', (r) => r.notes.join(' ')]]} />
    </> : <p>Velg «Sammenlign register» for å kontrollere aktive registerposter. Registeret endres ikke.</p>)}
  </section>;
}

import { addressLabel, propertyLabel } from '@/lib/map/normalization';
import { STATUS_LABELS } from '@/lib/map/comparison';

export default function ObjectDetails({ selected, comparison, onClose, onSelect }) {
  if (!selected) return null;
  const rows = selected.kind === 'comparison' ? [selected] : comparison?.rows.filter((r) => r.officialAddresses.some((o) => o.id === selected.id)) || [];
  return <section className="map-object-details" aria-label="Valgt kartobjekt" aria-live="polite">
    <div className="map-actions"><h2>{selected.address || selected.name || selected.register?.address || 'Valgt objekt'}</h2><button type="button" className="admin-button" onClick={onClose}>Lukk detaljer</button></div>
    <p>Kilde: {selected.source}</p>
    {selected.kind === 'address' && <dl><dt>Offisiell adresse · Kartverket</dt><dd>{addressLabel(selected)}</dd><dt>Matrikkelreferanse</dt><dd>{propertyLabel(selected)}</dd>
      <dt>Postadresse</dt><dd>{selected.postalCode || '–'} {selected.postalPlace || ''}</dd><dt>Koordinater (lengde, bredde)</dt><dd>{selected.longitude}, {selected.latitude}</dd></dl>}
    {selected.kind === 'road' && <p>Type: {selected.roadType || '–'} · Lengde i polygon: {Math.round(selected.lengthMeters)} m · Dekke: {selected.surface || 'Ukjent'} · Tilgang: {selected.access || 'Ukjent'}</p>}
    {selected.kind === 'property' && <div><p>Adresseplasseringer for {selected.label}; ikke eiendomsgrenser.</p>{selected.addresses.map((a) => <button key={a.id} type="button" className="map-row-link" onClick={() => onSelect(a)}>{addressLabel(a)}</button>)}</div>}
    {selected.kind === 'boundary' && <div><p>Matrikkelreferanser: {selected.references.map((p) => `${p.municipalityNumber || 'Kommune ukjent'}: ${propertyLabel(p)}`).join(' | ')}</p>
      <p>Nøyaktighetsklasse: {selected.accuracy || 'Ukjent'} · Tvist: {selected.disputed === null ? 'Ukjent' : selected.disputed ? 'Registrert' : 'Ikke flagget'}. Dette er registrert teiggeometri, ikke grensepåvisning.</p></div>}
    {rows.map((row) => <div key={row.id} className="map-register-detail"><h3>{row.scope === 'unknown' ? 'Plassering ukjent · ikke geografisk klassifisert' : `${row.status} · ${STATUS_LABELS[row.status]}`}</h3>
      <p>Kartverket: {row.officialAddresses.map((o) => `${addressLabel(o)} (${propertyLabel(o)})`).join(' | ') || 'Ingen kobling i kartutsnittet'}</p>
      {row.officialAddresses.length > 1 && <div className="map-actions">{row.officialAddresses.map((o) => <button type="button" key={o.id} className="map-row-link" onClick={() => onSelect(o)}>Vis {addressLabel(o)}</button>)}</div>}
      {row.register && <><h3>Turufjell vel · internt register</h3><p>{row.register.hNumber || 'H-nummer mangler'} · {row.register.address || 'Adresse mangler'} · {propertyLabel(row.register)}</p>
        <p>Registrert hjemmelshaver/kontakt: {row.register.owners?.join(' · ') || 'Ikke registrert'}</p></>}
      <p>{row.notes.join(' ')}</p>
    </div>)}
    {selected.kind === 'address' && !comparison && <p>Registerdata er ikke hentet. Velg «Sammenlign register» for å vise intern kobling.</p>}
  </section>;
}

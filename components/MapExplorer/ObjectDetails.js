import { addressLabel, propertyLabel } from '@/lib/map/normalization';
import { comparisonRowsForSelection } from '@/lib/map/selection';
import { useI18n } from '@/components/LocaleProvider';

export default function ObjectDetails({ selected, comparison, onClose, onSelect, onOpenMember }) {
  const { t, formatLocale } = useI18n('map.admin');
  if (!selected) return null;
  const rows = comparisonRowsForSelection(selected, comparison);
  const members = [...new Map(rows.filter((row) => row.register?.id).map((row) => [String(row.register.id), row.register])).values()];
  const isPropertyObject = ['address', 'property', 'boundary'].includes(selected.kind);
  return <section className="map-object-details" aria-label={t('object.region')} aria-live="polite">
    <div className="map-actions"><h2>{selected.address || selected.name || selected.register?.address || t('object.selected')}</h2><button type="button" className="admin-button" onClick={onClose}>{t('object.close')}</button></div>
    <p>{t('object.source')}: {selected.source}</p>
    {selected.kind === 'hamlet' && <p>{selected.reviewed ? t('object.reviewed') : t('object.draft')} · {selected.areaM2?.toLocaleString(formatLocale)} m².
      {' '}{t('object.hamletHelp')}</p>}
    {selected.kind === 'address' && <dl><dt>{t('object.officialAddress')}</dt><dd>{addressLabel(selected)}</dd><dt>{t('object.cadastral')}</dt><dd>{propertyLabel(selected)}</dd>
      <dt>{t('object.postalAddress')}</dt><dd>{selected.postalCode || '–'} {selected.postalPlace || ''}</dd><dt>{t('object.coordinates')}</dt><dd>{selected.longitude}, {selected.latitude}</dd></dl>}
    {selected.kind === 'road' && <p>{t('object.type')}: {selected.roadType || '–'} · {t('object.length')}: {Math.round(selected.lengthMeters)} m · {t('object.surface')}: {selected.surface || t('object.unknown')} · {t('object.access')}: {selected.access || t('object.unknown')}</p>}
    {selected.kind === 'property' && <div><p>{t('object.propertyLocations', {label: selected.label})}</p>{selected.addresses.map((a) => <button key={a.id} type="button" className="map-row-link" onClick={() => onSelect(a)}>{addressLabel(a)}</button>)}</div>}
    {selected.kind === 'boundary' && <div><p>{t('object.references')}: {selected.references.map((p) => `${p.municipalityNumber || t('object.unknownMunicipality')}: ${propertyLabel(p)}`).join(' | ')}</p>
      <p>{t('object.accuracy')}: {selected.accuracy || t('object.unknown')} · {t('object.dispute')}: {selected.disputed === null ? t('object.unknown') : selected.disputed ? t('object.registered') : t('object.notFlagged')}. {t('object.boundaryHelp')}</p></div>}
    {rows.map((row) => <div key={row.id} className="map-register-detail"><h3>{row.scope === 'unknown' ? t('object.unknownLocation') : t(`statuses.${row.status}`, {}, t('object.unknown'))}</h3>
      <dl><dt>{t('object.source')}</dt><dd>{row.register ? t('results.comparisonSource') : t('object.kartverket')}</dd>
        <dt>{t('results.columns.difference')}</dt><dd>{row.notes.join(' ') || t('results.noDifference')}</dd>
        {row.status && <><dt>{t('results.columns.confidence')}</dt><dd>{t(`results.confidence.${row.status}`)}</dd><dt>{t('results.columns.nextAction')}</dt><dd>{t(`results.actions.${row.status}`)}</dd></>}</dl>
      <p>{t('object.kartverket')}: {row.officialAddresses.map((o) => `${addressLabel(o)} (${propertyLabel(o)})`).join(' | ') || t('object.noMapLink')}</p>
      {row.officialAddresses.length > 1 && <div className="map-actions">{row.officialAddresses.map((o) => <button type="button" key={o.id} className="map-row-link" onClick={() => onSelect(o)}>{t('object.show', {address: addressLabel(o)})}</button>)}</div>}
      {row.register && <><h3>{t('object.internalRegister')}</h3><p>{row.register.hNumber || t('object.missingHNumber')} · {row.register.address || t('object.missingAddress')} · {propertyLabel(row.register)}</p>
        <p>{t('object.registeredOwner')}: {row.register.owners?.join(' · ') || t('object.notRegistered')}</p></>}
      <p>{row.notes.join(' ')}</p>
    </div>)}
    {members.length > 0 && <div><h3>{members.length > 1 ? t('object.multipleRecords') : t('object.memberRecord')}</h3><div className="map-actions">{members.map((member) => <button type="button" className="admin-button" key={member.id} data-member-opener={member.id} onClick={() => onOpenMember(String(member.id))}>{t('object.openMember', {label: member.hNumber || member.address || t('object.memberFallback', {id: member.id})})}</button>)}</div></div>}
    {isPropertyObject && comparison && members.length === 0 && <p className="map-warning">{t('object.noMember')}</p>}
    {selected.kind === 'address' && !comparison && <p>{t('object.registerNotFetched')}</p>}
  </section>;
}

import { addressLabel, propertyLabel } from '@/lib/map/normalization';
import { comparisonRowsForSelection } from '@/lib/map/selection';
import { useI18n } from '@/components/LocaleProvider';
import { useEffect, useState } from 'react';

function display(value, fallback) {
  if (Array.isArray(value)) return value.filter(Boolean).join(' · ') || fallback;
  return value || fallback;
}

export default function ObjectDetails({ selected, comparison, onClose, onSelect, onOpenMember }) {
  const { t, formatLocale } = useI18n('map.admin');
  const rows = comparisonRowsForSelection(selected, comparison);
  const members = [...new Map(rows.filter((row) => row.register?.id).map((row) => [String(row.register.id), row.register])).values()];
  const memberKey = members.map(({ id }) => String(id)).join(',');
  const [memberState, setMemberState] = useState({ key: memberKey, status: memberKey ? 'loading' : 'idle', details: {} });
  const activeMemberState = memberState.key === memberKey
    ? memberState
    : { key: memberKey, status: memberKey ? 'loading' : 'idle', details: {} };

  useEffect(() => {
    const controller = new AbortController();
    const memberIds = memberKey ? memberKey.split(',') : [];
    if (!memberIds.length) return () => controller.abort();
    Promise.all(memberIds.map(async (id) => {
      const response = await fetch(`/api/admin/members/${encodeURIComponent(id)}`, {
        cache: 'no-store', signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok || !body.ok || !body.member) throw new Error('Member details unavailable');
      return [id, body.member];
    }))
      .then((entries) => { if (!controller.signal.aborted) setMemberState({ key: memberKey, status: 'loaded', details: Object.fromEntries(entries) }); })
      .catch(() => { if (!controller.signal.aborted) setMemberState({ key: memberKey, status: 'failed', details: {} }); });
    return () => controller.abort();
  }, [memberKey]);

  if (!selected) return null;
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
    {members.length > 0 && <div className="map-selected-members" aria-busy={activeMemberState.status === 'loading'}>
      <h3>{members.length > 1 ? t('object.multipleRecords') : t('object.memberRecord')}</h3>
      {activeMemberState.status === 'loading' && <p role="status">{t('object.loadingMember')}</p>}
      {activeMemberState.status === 'failed' && <p className="map-warning" role="alert">{t('object.memberLoadError')}</p>}
      {members.map((member) => {
        const details = activeMemberState.details[String(member.id)];
        const label = member.hNumber || member.address || t('object.memberFallback', {id: member.id});
        return <section className="map-selected-member" key={member.id} aria-label={label}>
          {details && <div className="map-selected-member-grid">
            <div><h4>{t('memberDetails.cadastralData')}</h4><dl>
              <dt>{t('memberDetails.fields.h_number')}</dt><dd>{display(details.h_number, t('object.notRegistered'))}</dd>
              <dt>{t('memberDetails.fields.cadastral_number')}</dt><dd>{display(details.cadastral_number, t('object.notRegistered'))}</dd>
              <dt>{t('memberDetails.fields.section_number')}</dt><dd>{display(details.section_number, t('object.notRegistered'))}</dd>
              <dt>{t('memberDetails.streetAddress')}</dt><dd>{display(details.street_address, t('object.notRegistered'))}</dd>
              <dt>{t('memberDetails.titleHolder')}</dt><dd>{display(details.title_holder, t('object.notRegistered'))}</dd>
              <dt>{t('memberDetails.registrationDate')}</dt><dd>{display(details.registration_date, t('object.notRegistered'))}</dd>
            </dl></div>
            <div><h4>{t('memberDetails.contactInformation')}</h4><dl>
              <dt>{t('memberDetails.fields.primary_contact_name')}</dt><dd>{display(details.primary_contact_name, t('object.notRegistered'))}</dd>
              <dt>{t('memberDetails.fields.primary_contact_email')}</dt><dd>{display(details.primary_contact_email, t('object.notRegistered'))}</dd>
              <dt>{t('memberDetails.fields.other_contact_emails')}</dt><dd>{display(details.other_contact_emails, t('object.notRegistered'))}</dd>
            </dl></div>
          </div>}
          <button type="button" className="admin-button" data-member-opener={member.id} onClick={() => onOpenMember(String(member.id))}>{t('object.openMember', {label})}</button>
        </section>;
      })}
    </div>}
    {isPropertyObject && comparison && members.length === 0 && <p className="map-warning">{t('object.noMember')}</p>}
    {selected.kind === 'address' && !comparison && <p>{t('object.registerNotFetched')}</p>}
  </section>;
}

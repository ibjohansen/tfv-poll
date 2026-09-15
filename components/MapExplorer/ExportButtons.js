export default function ExportButtons({ ready, hasRoads, hasComparison, busy, onExport, onCopy }) {
  return <section aria-label="Eksport og kopiering" className="map-exports">
    <div className="map-actions">
      <button type="button" className="admin-button" disabled={!ready || busy} onClick={() => onExport('addresses-csv')}>Adresse-CSV</button>
      <button type="button" className="admin-button" disabled={!hasComparison || busy} onClick={() => onExport('comparison-csv')}>Sammenlignings-CSV (personopplysninger)</button>
      <button type="button" className="admin-button" disabled={!ready || busy} onClick={() => onExport('geojson')}>GeoJSON{hasRoads ? ' med veier' : ''}</button>
      <button type="button" className="admin-button" disabled={!ready || busy} onClick={() => onCopy('addresses')}>Kopier adresser</button>
      <button type="button" className="admin-button" disabled={!ready && !hasRoads || busy} onClick={() => onCopy('roads')}>Kopier veinavn</button>
    </div>
    <p className="muted">Eksport gjelder hele søket, ikke tabellfilteret, og henter oppdatert grunnlag dersom kartcachen er utløpt. Sammenlignings-CSV inneholder interne kontaktopplysninger og må lagres sikkert. GeoJSON inneholder ikke medlemsdata eller eiendomsgrenser.</p>
  </section>;
}

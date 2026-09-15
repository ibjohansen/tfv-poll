'use client';

export default function DrawingControls({ vertices, drawing, editing, onStart, onFinish, onEdit, onDelete, onChange }) {
  return <section aria-label="Søkeområde" className="map-drawing-controls">
    <div className="map-actions">
      <button type="button" className="admin-button" onClick={onStart} disabled={vertices.length > 0 || drawing}>Tegn polygon</button>
      {(drawing || editing) && <button type="button" className="admin-button primary" onClick={onFinish} disabled={vertices.length < 3}>Fullfør polygon</button>}
      {!drawing && !editing && vertices.length > 0 && <button type="button" className="admin-button" onClick={onEdit}>Rediger polygon</button>}
      <button type="button" className="admin-button" onClick={onDelete} disabled={!vertices.length && !drawing}>Slett polygon</button>
      {drawing && vertices.length > 0 && <button type="button" className="admin-button" onClick={() => onChange(vertices.slice(0, -1))}>Angre siste punkt</button>}
    </div>
    <p className="muted">{drawing ? 'Klikk eller trykk i kartet for å legge til hjørner. Velg Fullfør polygon når området er klart.' : editing ? 'Dra hjørnene i kartet eller endre koordinatene nedenfor. Fullfør for å søke på nytt.' : 'Tegn ett område på maksimalt 25 km². Ingen registeropplysninger endres.'}</p>
    {(drawing || editing) && <details><summary>Koordinater og tilgjengelig polygonredigering ({vertices.length} punkter)</summary>
      <p>GeoJSON-rekkefølge: lengdegrad, breddegrad. Legg til eller fjern hjørner her, eller bruk kartet.</p>
      <ol className="map-coordinate-list">{vertices.map((point, index) => <li key={index}>
        {[0, 1].map((axis) => <label key={axis}>{axis ? 'Breddegrad' : 'Lengdegrad'} {index + 1}
          <input type="number" step="0.000001" value={point[axis]} onChange={(event) => {
            const value = event.target.valueAsNumber;
            if (Number.isFinite(value)) onChange(vertices.map((p, i) => i === index ? p.map((v, a) => a === axis ? value : v) : p));
          }} /></label>)}
        <button type="button" className="admin-button" onClick={() => onChange(vertices.filter((_, i) => i !== index))}>Fjern punkt {index + 1}</button>
        <button type="button" className="admin-button" onClick={() => {
          const next = vertices[(index + 1) % vertices.length];
          onChange([...vertices.slice(0, index + 1), [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2], ...vertices.slice(index + 1)]);
        }}>Sett inn etter {index + 1}</button>
      </li>)}</ol>
    </details>}
  </section>;
}

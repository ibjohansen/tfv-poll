'use client';

import { useI18n } from '@/components/LocaleProvider';

export default function DrawingControls({ vertices, drawing, editing, onStart, onFinish, onEdit, onDelete, onChange, disabled = false }) {
  const { t } = useI18n('map.admin.drawing');
  return <fieldset aria-label={t('area')} className="map-drawing-controls" disabled={disabled}>
    <legend>{t('polygon')}</legend>
    <div className="map-actions">
      <button type="button" className="admin-button" onClick={onStart} disabled={vertices.length > 0 || drawing}>{t('draw')}</button>
      {(drawing || editing) && <button type="button" className="admin-button primary" onClick={onFinish} disabled={vertices.length < 3}>{t('finish')}</button>}
      {!drawing && !editing && vertices.length > 0 && <button type="button" className="admin-button" onClick={onEdit}>{t('edit')}</button>}
      <button type="button" className="admin-button" onClick={onDelete} disabled={!vertices.length && !drawing}>{t('delete')}</button>
      {drawing && vertices.length > 0 && <button type="button" className="admin-button" onClick={() => onChange(vertices.slice(0, -1))}>{t('undo')}</button>}
    </div>
    <p className="muted">{t(drawing ? 'drawHelp' : editing ? 'editHelp' : 'help')}</p>
    {(drawing || editing) && <details><summary>{t('coordinates', {count: vertices.length})}</summary>
      <p>{t('coordinateHelp')}</p>
      <ol className="map-coordinate-list">{vertices.map((point, index) => <li key={index}>
        {[0, 1].map((axis) => <label key={axis}>{t(axis ? 'latitude' : 'longitude')} {index + 1}
          <input type="number" step="0.000001" value={point[axis]} onChange={(event) => {
            const value = event.target.valueAsNumber;
            if (Number.isFinite(value)) onChange(vertices.map((p, i) => i === index ? p.map((v, a) => a === axis ? value : v) : p));
          }} /></label>)}
        <button type="button" className="admin-button" onClick={() => onChange(vertices.filter((_, i) => i !== index))}>{t('remove', {number: index + 1})}</button>
        <button type="button" className="admin-button" onClick={() => {
          const next = vertices[(index + 1) % vertices.length];
          onChange([...vertices.slice(0, index + 1), [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2], ...vertices.slice(index + 1)]);
        }}>{t('insert', {number: index + 1})}</button>
      </li>)}</ol>
    </details>}
  </fieldset>;
}

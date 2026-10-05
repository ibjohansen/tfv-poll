'use client';

import { useApiClient } from '@/components/useApiClient';
import { useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { activityCatalogLabel } from '@/lib/activity-map-catalog';
import { activityMapIconKind, activityMapIconMarkup } from '@/lib/activity-map-icons';

const newCategory = () => ({ id: '', name: '', color: '#20636c' });
const newType = (category = 'cycling') => ({ id: '', category, name: '', geometryKind: 'polygon' });
const newSubtype = (category = 'alpine', featureType = 'lift') => ({ id: '', category, featureType, name: '' });

function catalogIconFeature(kind, record) {
  if (kind === 'category') return { category: record.id, categoryName: record.name, iconUrl: record.iconUrl };
  if (kind === 'type') return { category: record.category, featureType: record.id, typeName: record.name, iconUrl: record.iconUrl };
  return { category: record.category, featureType: record.featureType, featureSubtype: record.id, subtypeName: record.name, iconUrl: record.iconUrl };
}

function IconPreview({ kind, record, label }) {
  const feature = catalogIconFeature(kind, record);
  return <span className={`activity-catalog-icon-preview is-${activityMapIconKind(feature)}`} aria-label={label}
    dangerouslySetInnerHTML={{ __html: activityMapIconMarkup(feature) }} />;
}

export default function ActivityMapCatalogManager({ catalog, onChange, disabled }) {
  const apiFetch = useApiClient();
  const { t } = useI18n('activityMap.admin');
  const [category, setCategory] = useState(newCategory);
  const [type, setType] = useState(newType);
  const [subtype, setSubtype] = useState(newSubtype);
  const [iconFiles, setIconFiles] = useState({ category: null, type: null, subtype: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const label = (record, kind) => activityCatalogLabel(record, kind, t);
  const typesForSubtype = catalog.types.filter((item) => item.category === subtype.category);
  const subtypesForSelection = (catalog.subtypes || []).filter((item) => item.category === subtype.category && item.featureType === subtype.featureType);

  function itemFromCatalog(nextCatalog, kind, value) {
    const key = kind === 'category' ? 'categories' : kind === 'type' ? 'types' : 'subtypes';
    return nextCatalog[key].find((item) => (value.id ? item.id === value.id : item.name === value.name.trim().replace(/\s+/g, ' '))
      && (kind === 'category' || item.category === value.category)
      && (kind !== 'subtype' || item.featureType === value.featureType));
  }

  async function uploadIcon(kind, value, file) {
    if (!file) return null;
    const form = new FormData();
    form.set('kind', kind); form.set('id', value.id); form.set('version', String(value.version));
    if (kind !== 'category') form.set('category', value.category);
    if (kind === 'subtype') form.set('featureType', value.featureType);
    form.set('file', file);
    const response = await apiFetch('/api/admin/activity-map/catalog/icon', { method: 'POST', credentials: 'same-origin', body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.message || t('requestError'));
    return body.catalog;
  }

  async function save(event, kind, value) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiFetch('/api/admin/activity-map/catalog', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...value, kind, action: value.id ? 'update' : 'create' }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || t('requestError'));
      const saved = itemFromCatalog(body.catalog, kind, value);
      const nextCatalog = await uploadIcon(kind, saved, iconFiles[kind]) || body.catalog;
      const selected = itemFromCatalog(nextCatalog, kind, saved);
      onChange(nextCatalog);
      if (kind === 'category') setCategory(selected || newCategory());
      if (kind === 'type') setType(selected || newType(value.category));
      if (kind === 'subtype') setSubtype(selected || newSubtype(value.category, value.featureType));
      setIconFiles((current) => ({ ...current, [kind]: null }));
      setNotice(t('catalog.saved'));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function removeIcon(kind, value) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiFetch('/api/admin/activity-map/catalog/icon', {
        method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id: value.id, category: value.category, featureType: value.featureType, version: value.version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || t('requestError'));
      const selected = itemFromCatalog(body.catalog, kind, value);
      onChange(body.catalog);
      if (kind === 'category') setCategory(selected);
      if (kind === 'type') setType(selected);
      if (kind === 'subtype') setSubtype(selected);
      setNotice(t('catalog.iconRemoved'));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  function iconFields(kind, value) {
    return <div className="activity-catalog-icon-fields">
      <span className="activity-catalog-icon-label">{t('catalog.icon')}</span><IconPreview kind={kind} record={value} label={t('catalog.iconPreview')} />
      <label>{t('catalog.iconUpload')}<input type="file" accept="image/svg+xml,.svg" onChange={(event) => setIconFiles((current) => ({ ...current, [kind]: event.target.files?.[0] || null }))} /></label>
      <small>{iconFiles[kind]?.name || t('catalog.iconHelp')}</small>
      {value.id && value.iconUrl && <button type="button" className="admin-button" onClick={() => removeIcon(kind, value)}>{t('catalog.removeIcon')}</button>}
    </div>;
  }

  return <details className="activity-catalog-manager">
    <summary>{t('catalog.title')}</summary>
    <p className="muted">{t('catalog.help')}</p>
    <div className="activity-catalog-forms">
      <form aria-label={t('catalog.categoryForm')} onSubmit={(event) => save(event, 'category', category)}>
        <fieldset disabled={disabled || busy}>
          <legend>{t('catalog.categoryForm')}</legend>
          <label>{t('catalog.chooseCategory')}<select value={category.id} onChange={(event) => { setIconFiles((current) => ({ ...current, category: null })); setCategory(catalog.categories.find((item) => item.id === event.target.value) || newCategory()); }}>
            <option value="">{t('catalog.newCategory')}</option>{catalog.categories.map((item) => <option key={item.id} value={item.id}>{label(item, 'categories')}</option>)}</select></label>
          <label>{t('catalog.categoryName')}<input required maxLength={80} value={category.name} onChange={(event) => setCategory({ ...category, name: event.target.value })} /></label>
          <label>{t('catalog.categoryColor')}<input type="color" value={category.color} onChange={(event) => setCategory({ ...category, color: event.target.value })} /></label>
          {iconFields('category', category)}
          <button type="submit" className="admin-button" disabled={!category.name.trim()}>{t('catalog.saveCategory')}</button>
        </fieldset>
      </form>
      <form aria-label={t('catalog.typeForm')} onSubmit={(event) => save(event, 'type', type)}>
        <fieldset disabled={disabled || busy}>
          <legend>{t('catalog.typeForm')}</legend>
          <label>{t('category')}<select value={type.category} onChange={(event) => { setIconFiles((current) => ({ ...current, type: null })); setType(newType(event.target.value)); }}>
            {catalog.categories.map((item) => <option key={item.id} value={item.id}>{label(item, 'categories')}</option>)}</select></label>
          <label>{t('catalog.chooseType')}<select value={type.id} onChange={(event) => { setIconFiles((current) => ({ ...current, type: null })); setType(catalog.types.find((item) => item.category === type.category && item.id === event.target.value) || newType(type.category)); }}>
            <option value="">{t('catalog.newType')}</option>{catalog.types.filter((item) => item.category === type.category).map((item) => <option key={item.id} value={item.id}>{label(item, 'types')}</option>)}</select></label>
          <label>{t('catalog.typeName')}<input required maxLength={80} value={type.name} onChange={(event) => setType({ ...type, name: event.target.value })} /></label>
          <label>{t('catalog.geometry')}<select value={type.geometryKind} disabled={Boolean(type.id)} aria-describedby="activity-type-geometry-help" onChange={(event) => setType({ ...type, geometryKind: event.target.value })}>
            {['polygon', 'line', 'point'].map((kind) => <option key={kind} value={kind}>{t(`catalog.geometries.${kind}`)}</option>)}</select></label>
          <p id="activity-type-geometry-help" className="muted">{t('catalog.geometryHelp')}</p>
          {iconFields('type', type)}
          <button type="submit" className="admin-button" disabled={!type.name.trim()}>{t('catalog.saveType')}</button>
        </fieldset>
      </form>
      <form aria-label={t('catalog.subtypeForm')} onSubmit={(event) => save(event, 'subtype', subtype)}>
        <fieldset disabled={disabled || busy}>
          <legend>{t('catalog.subtypeForm')}</legend>
          <label>{t('category')}<select value={subtype.category} onChange={(event) => { const nextType = catalog.types.find((item) => item.category === event.target.value)?.id || ''; setIconFiles((current) => ({ ...current, subtype: null })); setSubtype(newSubtype(event.target.value, nextType)); }}>
            {catalog.categories.map((item) => <option key={item.id} value={item.id}>{label(item, 'categories')}</option>)}</select></label>
          <label>{t('type')}<select value={subtype.featureType} onChange={(event) => { setIconFiles((current) => ({ ...current, subtype: null })); setSubtype(newSubtype(subtype.category, event.target.value)); }}>
            {!typesForSubtype.length && <option value="">{t('catalog.selectType')}</option>}{typesForSubtype.map((item) => <option key={item.id} value={item.id}>{label(item, 'types')}</option>)}</select></label>
          <label>{t('catalog.chooseSubtype')}<select value={subtype.id} onChange={(event) => { setIconFiles((current) => ({ ...current, subtype: null })); setSubtype(subtypesForSelection.find((item) => item.id === event.target.value) || newSubtype(subtype.category, subtype.featureType)); }}>
            <option value="">{t('catalog.newSubtype')}</option>{subtypesForSelection.map((item) => <option key={item.id} value={item.id}>{label(item, 'subtypes')}</option>)}</select></label>
          <label>{t('catalog.subtypeName')}<input required maxLength={80} value={subtype.name} onChange={(event) => setSubtype({ ...subtype, name: event.target.value })} /></label>
          {iconFields('subtype', subtype)}
          <button type="submit" className="admin-button" disabled={!subtype.featureType || !subtype.name.trim()}>{t('catalog.saveSubtype')}</button>
        </fieldset>
      </form>
    </div>
    {busy && <p role="status">{t('saving')}</p>}{error && <p role="alert" className="error-message">{error}</p>}{notice && <p role="status">{notice}</p>}
  </details>;
}

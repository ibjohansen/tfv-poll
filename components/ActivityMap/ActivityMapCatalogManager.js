'use client';

import { useApiClient } from '@/components/useApiClient';

import { useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { activityCatalogLabel } from '@/lib/activity-map-catalog';

export default function ActivityMapCatalogManager({ catalog, onChange, disabled }) {
  const apiFetch = useApiClient();
  const { t } = useI18n('activityMap.admin');
  const [category, setCategory] = useState({ id: '', name: '', color: '#20636c' });
  const [type, setType] = useState({ id: '', category: 'cycling', name: '', geometryKind: 'polygon' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const label = (record, kind) => activityCatalogLabel(record, kind, t);

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
      onChange(body.catalog);
      // Keep the saved item selected, with its latest optimistic-lock version.
      if (kind === 'category') setCategory(body.catalog.categories.find((item) => value.id ? item.id === value.id : item.name === value.name.trim().replace(/\s+/g, ' ')));
      else setType(body.catalog.types.find((item) => item.category === value.category
        && (value.id ? item.id === value.id : item.name === value.name.trim().replace(/\s+/g, ' '))));
      setNotice(t('catalog.saved'));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <details className="activity-catalog-manager">
    <summary>{t('catalog.title')}</summary>
    <p className="muted">{t('catalog.help')}</p>
    <div className="activity-catalog-forms">
      <form aria-label={t('catalog.categoryForm')} onSubmit={(event) => save(event, 'category', category)}>
        <fieldset disabled={disabled || busy}>
          <legend>{t('catalog.categoryForm')}</legend>
          <label>{t('catalog.chooseCategory')}<select value={category.id} onChange={(event) => setCategory(catalog.categories.find((item) => item.id === event.target.value) || { id: '', name: '', color: '#20636c' })}>
            <option value="">{t('catalog.newCategory')}</option>{catalog.categories.map((item) => <option key={item.id} value={item.id}>{label(item, 'categories')}</option>)}
          </select></label>
          <label>{t('catalog.categoryName')}<input required maxLength={80} value={category.name} onChange={(event) => setCategory({ ...category, name: event.target.value })} /></label>
          <label>{t('catalog.categoryColor')}<input type="color" value={category.color} onChange={(event) => setCategory({ ...category, color: event.target.value })} /></label>
          <button type="submit" className="admin-button" disabled={!category.name.trim()}>{t('catalog.saveCategory')}</button>
        </fieldset>
      </form>
      <form aria-label={t('catalog.typeForm')} onSubmit={(event) => save(event, 'type', type)}>
        <fieldset disabled={disabled || busy}>
          <legend>{t('catalog.typeForm')}</legend>
          <label>{t('category')}<select value={type.category} onChange={(event) => setType({ id: '', category: event.target.value, name: '', geometryKind: 'polygon' })}>
            {catalog.categories.map((item) => <option key={item.id} value={item.id}>{label(item, 'categories')}</option>)}
          </select></label>
          <label>{t('catalog.chooseType')}<select value={type.id} onChange={(event) => setType(catalog.types.find((item) => item.category === type.category && item.id === event.target.value)
            || { id: '', category: type.category, name: '', geometryKind: 'polygon' })}>
            <option value="">{t('catalog.newType')}</option>{catalog.types.filter((item) => item.category === type.category).map((item) => <option key={item.id} value={item.id}>{label(item, 'types')}</option>)}
          </select></label>
          <label>{t('catalog.typeName')}<input required maxLength={80} value={type.name} onChange={(event) => setType({ ...type, name: event.target.value })} /></label>
          <label>{t('catalog.geometry')}<select value={type.geometryKind} disabled={Boolean(type.id)} aria-describedby="activity-type-geometry-help" onChange={(event) => setType({ ...type, geometryKind: event.target.value })}>
            {['polygon', 'line', 'point'].map((kind) => <option key={kind} value={kind}>{t(`catalog.geometries.${kind}`)}</option>)}
          </select></label>
          <p id="activity-type-geometry-help" className="muted">{t('catalog.geometryHelp')}</p>
          <button type="submit" className="admin-button" disabled={!type.name.trim()}>{t('catalog.saveType')}</button>
        </fieldset>
      </form>
    </div>
    {busy && <p role="status">{t('saving')}</p>}{error && <p role="alert" className="error-message">{error}</p>}{notice && <p role="status">{notice}</p>}
  </details>;
}

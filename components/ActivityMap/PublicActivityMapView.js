'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ACTIVITY_MAP_CENTER, smoothActivityGeometry } from '@/lib/activity-map-display';
import { BACKGROUND_MAP, SATELLITE_MAP } from '@/lib/map/sources';
import { useI18n } from '@/components/LocaleProvider';
import { activityCategoryColor, activityCategoryLabel, activityTypeLabel } from '@/lib/activity-map-catalog';
import { ACTIVITY_MAP_SOURCES } from '@/lib/activity-map-sources';
import { revealLeafletLayerWithoutZoom } from '@/lib/map/leaflet-viewport';

const latLng = ([longitude, latitude]) => [latitude, longitude];
const alpineColors = { blue: '#2166ac', yellow: '#d6a900', green: '#238b45', red: '#c92f2f', black: '#202124' };

function featureStyle(feature, colors, selected) {
  const color = colors && feature.alpineColor ? alpineColors[feature.alpineColor] : activityCategoryColor(feature);
  return { className: `public-activity-feature${selected ? ' is-selected' : ''}`,
    color, fillColor: color, weight: selected ? 7 : 4, fillOpacity: selected ? .38 : .2, opacity: 1 };
}

function fitVisibleFeatures(map, group) {
  if (!map || !group) return;
  const bounds = group.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { animate: false, maxZoom: 17, padding: [42, 42] });
  else map.setView(latLng(ACTIVITY_MAP_CENTER), 13, { animate: false });
}

export default function PublicActivityMapView({ features, showAlpineColors, selectedId, isFullscreen, onSelect, onError }) {
  const { t } = useI18n('activityMap.public');
  const container = useRef(null);
  const mapRef = useRef(null);
  const baseLayers = useRef(null);
  const layers = useRef(null);
  const featureLayers = useRef(new Map());
  const sourceControl = useRef(null);
  const latestError = useRef(onError);
  const [baseMap, setBaseMap] = useState('topographic');
  useEffect(() => { latestError.current = onError; }, [onError]);

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false, zoomSnap: 0, zoomControl: false }).setView(latLng(ACTIVITY_MAP_CENTER), 16);
    mapRef.current = map;
    L.control.zoom({ zoomInTitle: t('zoomIn'), zoomOutTitle: t('zoomOut') }).addTo(map);
    map.attributionControl.setPrefix(false);
    const topographic = L.tileLayer(BACKGROUND_MAP.url, { attribution: BACKGROUND_MAP.attribution, maxZoom: BACKGROUND_MAP.maxZoom }).addTo(map);
    const satellite = L.tileLayer(SATELLITE_MAP.url, { attribution: SATELLITE_MAP.attribution, maxZoom: SATELLITE_MAP.maxZoom });
    baseLayers.current = { topographic, satellite };
    let warned = false;
    const warn = () => { if (!warned) latestError.current(t('tileError')); warned = true; };
    topographic.on('tileerror', warn);
    satellite.on('tileerror', warn);
    layers.current = L.featureGroup().addTo(map);
    const syncZoomLevel = () => { map.getContainer().dataset.zoomLevel = String(map.getZoom()); };
    map.on('zoomend', syncZoomLevel);
    syncZoomLevel();
    const attribution = L.control({ position: 'bottomright' });
    attribution.onAdd = () => {
      const element = L.DomUtil.create('div', 'activity-data-attribution leaflet-control');
      L.DomEvent.disableClickPropagation(element);
      return element;
    };
    attribution.addTo(map);
    sourceControl.current = attribution;
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); map.off('zoomend', syncZoomLevel); map.remove(); mapRef.current = null; baseLayers.current = null; sourceControl.current = null; };
  }, [t]);

  useEffect(() => {
    const element = sourceControl.current?.getContainer();
    if (!element) return;
    element.replaceChildren();
    const sourceIds = [...new Set(features.flatMap((item) => item.sources || []).map((source) => source.id))];
    if (!sourceIds.length) { element.hidden = true; return; }
    element.hidden = false;
    element.append(`${t('trailDataAttribution')}: `);
    sourceIds.map((id) => ACTIVITY_MAP_SOURCES[id]).filter(Boolean).forEach((source, index) => {
      if (index) element.append(' · ');
      const sourceLink = document.createElement('a');
      sourceLink.href = source.sourceUrl; sourceLink.target = '_blank'; sourceLink.rel = 'noopener noreferrer';
      sourceLink.textContent = `© ${source.name}`;
      const licenseLink = document.createElement('a');
      licenseLink.href = source.licenseUrl; licenseLink.target = '_blank'; licenseLink.rel = 'noopener noreferrer';
      licenseLink.textContent = source.licenseName;
      element.append(sourceLink, ' (', licenseLink, ')');
    });
  }, [features, t]);

  useEffect(() => {
    const map = mapRef.current;
    const available = baseLayers.current;
    if (!map || !available) return;
    for (const [name, layer] of Object.entries(available)) {
      if (name === baseMap) layer.addTo(map);
      else layer.removeFrom(map);
    }
  }, [baseMap]);

  useEffect(() => {
    const group = layers.current;
    group.clearLayers();
    featureLayers.current.clear();
    for (const feature of features) {
      const selected = feature.id === selectedId;
      const style = featureStyle(feature, showAlpineColors, selected);
      const layer = L.geoJSON({ type: 'Feature', properties: {}, geometry: smoothActivityGeometry(feature.geometry) }, {
        style,
        pointToLayer: (_item, point) => L.circleMarker(point, { ...style, radius: selected ? 12 : 9, fillOpacity: .92 }),
      }).addTo(group);
      const label = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = feature.activityNumber ? `${feature.activityNumber}. ${feature.name}` : feature.name;
      const detail = document.createElement('div');
      detail.textContent = `${activityCategoryLabel(feature, t)} · ${activityTypeLabel(feature, t)}${feature.alpineColor && showAlpineColors ? ` · ${t(`colors.${feature.alpineColor}`)}` : ''}`;
      label.append(name, detail);
      if (feature.tooltipText) {
        const description = document.createElement('p');
        description.textContent = feature.tooltipText;
        label.append(description);
      }
      layer.bindTooltip(label, { sticky: true, direction: 'auto' });
      const popup = label.cloneNode(true);
      if (feature.season) {
        const season = document.createElement('p');
        season.textContent = t(`seasons.${feature.season}`);
        popup.append(season);
      }
      if (feature.websiteUrl) {
        const link = document.createElement('a');
        link.href = feature.websiteUrl;
        link.textContent = t('visitWebsite');
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        popup.append(link);
      }
      layer.bindPopup(popup, { autoPan: false });
      layer.on('click', () => onSelect(feature.id));
      layer.eachLayer((item) => item.getElement()?.setAttribute('data-feature-id', feature.id));
      featureLayers.current.set(feature.id, layer);
    }
  }, [features, onSelect, selectedId, showAlpineColors, t]);

  useEffect(() => { fitVisibleFeatures(mapRef.current, layers.current); }, [features]);

  useEffect(() => {
    const layer = featureLayers.current.get(selectedId);
    if (!layer) return;
    revealLeafletLayerWithoutZoom(mapRef.current, layer);
    layer.openPopup();
  }, [selectedId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      mapRef.current?.invalidateSize();
      if (mapRef.current && layers.current) fitVisibleFeatures(mapRef.current, layers.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [isFullscreen]);

  return <div className="public-activity-map-frame"><div ref={container} className="public-activity-map" aria-label={t('canvasLabel')} />
    <label className="activity-map-layer-control"><span>{t('baseMap')}</span><select value={baseMap} onChange={(event) => setBaseMap(event.target.value)}>
      <option value="topographic">{t('topographicMap')}</option><option value="satellite">{t('satelliteMap')}</option>
    </select></label></div>;
}

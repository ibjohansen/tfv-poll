'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ACTIVITY_MAP_CENTER } from '@/lib/activity-map';
import { BACKGROUND_MAP, SATELLITE_MAP } from '@/lib/map/sources';
import { useI18n } from '@/components/LocaleProvider';

const latLng = ([longitude, latitude]) => [latitude, longitude];
const alpineColors = { blue: '#2166ac', yellow: '#d6a900', green: '#238b45', red: '#c92f2f', black: '#202124' };

function featureStyle(feature, colors, selected) {
  const color = feature.category === 'cycling' ? '#16745a' : colors && feature.alpineColor ? alpineColors[feature.alpineColor] : '#7d3147';
  return { color, fillColor: color, weight: selected ? 6 : 4, fillOpacity: selected ? .34 : .2, opacity: 1 };
}

export default function PublicActivityMapView({ features, showAlpineColors, selectedId, onSelect, onError }) {
  const { t } = useI18n('activityMap.public');
  const frame = useRef(null);
  const container = useRef(null);
  const mapRef = useRef(null);
  const baseLayers = useRef(null);
  const layers = useRef(null);
  const featureLayers = useRef(new Map());
  const latestError = useRef(onError);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; baseLayers.current = null; };
  }, [t]);

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
    setFullscreenSupported(Boolean(frame.current?.requestFullscreen && document.exitFullscreen));
    const handler = () => { setIsFullscreen(document.fullscreenElement === frame.current); window.requestAnimationFrame(() => mapRef.current?.invalidateSize()); };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  async function toggleFullscreen() {
    try { if (document.fullscreenElement === frame.current) await document.exitFullscreen(); else await frame.current?.requestFullscreen(); }
    catch { latestError.current(t('fullscreenError')); }
  }

  useEffect(() => {
    const group = layers.current;
    group.clearLayers();
    featureLayers.current.clear();
    for (const feature of features) {
      const selected = feature.id === selectedId;
      const style = featureStyle(feature, showAlpineColors, selected);
      const layer = L.geoJSON({ type: 'Feature', properties: {}, geometry: feature.geometry }, {
        style,
        pointToLayer: (_item, point) => L.circleMarker(point, { ...style, radius: selected ? 12 : 9, fillOpacity: .92 }),
      }).addTo(group);
      const label = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = feature.activityNumber ? `${feature.activityNumber}. ${feature.name}` : feature.name;
      const detail = document.createElement('div');
      detail.textContent = `${t(`categories.${feature.category}`)} · ${t(`types.${feature.featureType}`)}${feature.alpineColor && showAlpineColors ? ` · ${t(`colors.${feature.alpineColor}`)}` : ''}`;
      label.append(name, detail);
      layer.bindTooltip(label, { sticky: true, direction: 'auto' });
      layer.on('click', () => onSelect(feature.id));
      featureLayers.current.set(feature.id, layer);
    }
  }, [features, onSelect, selectedId, showAlpineColors, t]);

  useEffect(() => {
    const layer = featureLayers.current.get(selectedId);
    if (!layer) return;
    const bounds = layer.getBounds();
    if (bounds.isValid()) mapRef.current.fitBounds(bounds, { maxZoom: 18, padding: [42, 42] });
  }, [selectedId]);

  return <div ref={frame} className="public-activity-map-frame"><div ref={container} className="public-activity-map" aria-label={t('canvasLabel')} />
    <label className="activity-map-layer-control"><span>{t('baseMap')}</span><select value={baseMap} onChange={(event) => setBaseMap(event.target.value)}>
      <option value="topographic">{t('topographicMap')}</option><option value="satellite">{t('satelliteMap')}</option>
    </select></label>
    {fullscreenSupported && <button type="button" className="public-map-fullscreen" title={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')} onClick={toggleFullscreen}>
      <span className="visually-hidden">{isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">{isFullscreen ? <path d="M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6" /> : <path d="M9 3H3v6m12-6h6v6M9 21H3v-6m12 6h6v-6" />}</svg>
    </button>}</div>;
}

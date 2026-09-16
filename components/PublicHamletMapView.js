'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TURUFJELL_CENTER } from '@/lib/map/geo';
import { BACKGROUND_MAP, BUILDING_MAP } from '@/lib/map/sources';
import { useI18n } from '@/components/LocaleProvider';

const latLng = ([longitude, latitude]) => [latitude, longitude];

function syncBuildingLayer(map, layer) {
  const shouldShow = map.getZoom() >= BUILDING_MAP.minZoom;
  if (shouldShow && !map.hasLayer(layer)) layer.addTo(map);
  if (!shouldShow && map.hasLayer(layer)) map.removeLayer(layer);
}

export default function PublicHamletMapView({ hamlets, activeHamlet, properties, selectedProperty, onSelectHamlet, onSelectProperty, onError }) {
  const { t } = useI18n('map.public');
  const frame = useRef(null);
  const container = useRef(null);
  const mapRef = useRef(null);
  const buildingLayer = useRef(null);
  const overlays = useRef(null);
  const latestError = useRef(onError);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);

  useEffect(() => { latestError.current = onError; }, [onError]);
  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(latLng(TURUFJELL_CENTER), 14);
    mapRef.current = map;
    const tiles = L.tileLayer(BACKGROUND_MAP.url, { attribution: BACKGROUND_MAP.attribution, maxZoom: BACKGROUND_MAP.maxZoom }).addTo(map);
    let warned = false;
    tiles.on('tileerror', () => {
      if (!warned) latestError.current(t('tileError'));
      warned = true;
    });
    map.createPane('buildingPane');
    map.getPane('buildingPane').style.zIndex = '250';
    map.getPane('buildingPane').style.pointerEvents = 'none';
    const buildings = L.tileLayer.wms(BUILDING_MAP.url, {
      attribution: BUILDING_MAP.attribution,
      layers: BUILDING_MAP.layers,
      version: BUILDING_MAP.version,
      format: BUILDING_MAP.format,
      transparent: true,
      maxZoom: BUILDING_MAP.maxZoom,
      opacity: BUILDING_MAP.opacity,
      pane: 'buildingPane',
      updateWhenIdle: true,
      keepBuffer: 1,
    });
    let buildingWarned = false;
    buildings.on('tileerror', () => {
      if (!buildingWarned) latestError.current(t('buildingTileError'));
      buildingWarned = true;
    });
    buildingLayer.current = buildings;
    const syncBuildings = () => syncBuildingLayer(map, buildings);
    map.on('zoomend', syncBuildings);
    syncBuildings();
    overlays.current = L.featureGroup().addTo(map);
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); map.off('zoomend', syncBuildings); map.remove(); mapRef.current = null; buildingLayer.current = null; };
  }, [t]);

  useEffect(() => {
    setFullscreenSupported(Boolean(frame.current?.requestFullscreen && document.exitFullscreen));
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === frame.current);
      window.requestAnimationFrame(() => mapRef.current?.invalidateSize());
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === frame.current) await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    } catch {
      latestError.current(t('fullscreenError'));
    }
  }

  useEffect(() => {
    const group = overlays.current;
    group.clearLayers();
    for (const hamlet of hamlets) {
      const active = hamlet.id === activeHamlet?.id;
      const layer = L.geoJSON(hamlet.polygon, { style: { color: active ? '#5a2636' : '#955e6e', weight: active ? 4 : 2, fillColor: '#f79c80', fillOpacity: active ? 0.22 : 0.08 } }).addTo(group);
      layer.bindTooltip(hamlet.name);
      layer.on('click', () => onSelectHamlet(hamlet));
    }
    for (const property of properties) {
      if (!property.geometry && (!Number.isFinite(property.latitude) || !Number.isFinite(property.longitude))) continue;
      const active = property.id === selectedProperty?.id;
      const feature = property.geometry ? { type: 'Feature', properties: {}, geometry: property.geometry }
        : { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [property.longitude, property.latitude] } };
      const layer = L.geoJSON(feature, { pointToLayer: (_feature, point) => L.circleMarker(point, {
        radius: active ? 9 : 6, color: active ? '#5a2636' : '#33626d', fillColor: active ? '#f79c80' : '#7cabb3', fillOpacity: 0.95, weight: 2,
      }) }).addTo(group);
      layer.bindTooltip([property.hNumber, property.address, property.cadastralNumber].filter(Boolean).join(' · '));
      layer.on('click', () => onSelectProperty(property));
    }
  }, [activeHamlet, hamlets, onSelectHamlet, onSelectProperty, properties, selectedProperty]);

  useEffect(() => {
    const selectedGeometry = selectedProperty?.geometry || (selectedProperty
      && Number.isFinite(selectedProperty.latitude) && Number.isFinite(selectedProperty.longitude)
      ? { type: 'Point', coordinates: [selectedProperty.longitude, selectedProperty.latitude] }
      : null);
    const geometry = selectedGeometry || activeHamlet?.polygon?.geometry;
    if (!mapRef.current) return;
    if (!geometry) {
      mapRef.current.setView(latLng(TURUFJELL_CENTER), 14);
      return;
    }
    if (geometry.type === 'Point') mapRef.current.setView(latLng(geometry.coordinates), 17);
    else {
      const bounds = L.geoJSON({ type: 'Feature', properties: {}, geometry }).getBounds();
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { maxZoom: 16, padding: [32, 32] });
    }
  }, [activeHamlet, selectedProperty]);

  return <div ref={frame} className="public-hamlet-map-frame">
    <div ref={container} className="public-hamlet-map" aria-label={t('canvasLabel')} />
    {fullscreenSupported && <button className="public-map-fullscreen" type="button" onClick={toggleFullscreen}
      aria-pressed={isFullscreen} aria-label={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}
      title={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={isFullscreen
        ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
        : 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5'} /></svg>
    </button>}
  </div>;
}

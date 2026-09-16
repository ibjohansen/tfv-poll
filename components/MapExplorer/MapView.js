'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TURUFJELL_CENTER } from '@/lib/map/geo';
import { BACKGROUND_MAP, BUILDING_MAP } from '@/lib/map/sources';
import { useI18n } from '@/components/LocaleProvider';

const latLng = ([lon, lat]) => [lat, lon];

function syncBuildingLayer(map, layer, visible) {
  const shouldShow = visible && map.getZoom() >= BUILDING_MAP.minZoom;
  if (shouldShow && !map.hasLayer(layer)) layer.addTo(map);
  if (!shouldShow && map.hasLayer(layer)) map.removeLayer(layer);
}

export default function MapView({ vertices, drawing, editing, onVerticesChange, addresses = [], roads = [], registerPoints = [], boundaries = [], hamlets = [], layers, selected, onSelect, onError }) {
  const { t } = useI18n('map.admin');
  const container = useRef(null);
  const mapRef = useRef(null);
  const buildingLayer = useRef(null);
  const buildingsVisible = useRef(Boolean(layers.buildings));
  const overlay = useRef(null);
  const latest = useRef(null);

  useEffect(() => { latest.current = { vertices, drawing, onVerticesChange, onError }; }, [vertices, drawing, onVerticesChange, onError]);

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(latLng(TURUFJELL_CENTER), 14);
    mapRef.current = map;
    const tiles = L.tileLayer(BACKGROUND_MAP.url, {
      attribution: BACKGROUND_MAP.attribution, maxZoom: BACKGROUND_MAP.maxZoom,
    }).addTo(map);
    let warned = false;
    tiles.on('tileerror', () => {
      if (!warned) latest.current.onError(t('tileError'));
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
      if (!buildingWarned) latest.current.onError(t('buildingTileError'));
      buildingWarned = true;
    });
    buildingLayer.current = buildings;
    const syncBuildings = () => syncBuildingLayer(map, buildings, buildingsVisible.current);
    map.on('zoomend', syncBuildings);
    overlay.current = L.featureGroup().addTo(map);
    map.on('click', (event) => {
      const current = latest.current;
      if (current.drawing) current.onVerticesChange([...current.vertices, [event.latlng.lng, event.latlng.lat]]);
    });
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); map.off('zoomend', syncBuildings); map.remove(); mapRef.current = null; buildingLayer.current = null; };
  }, [t]);

  useEffect(() => {
    buildingsVisible.current = Boolean(layers.buildings);
    const map = mapRef.current;
    const buildings = buildingLayer.current;
    if (!map || !buildings) return;
    syncBuildingLayer(map, buildings, buildingsVisible.current);
  }, [layers.buildings]);

  useEffect(() => {
    const group = overlay.current;
    group.clearLayers();
    if (vertices.length > 1) {
      const shape = drawing ? L.polyline(vertices.map(latLng)) : L.polygon(vertices.map(latLng));
      shape.setStyle({ color: '#705338', weight: 3, fillOpacity: 0.08, interactive: false }).addTo(group);
    }
    if (drawing || editing) vertices.forEach((p, index) => {
      const marker = L.marker(latLng(p), {
        draggable: editing,
        title: t('vertexTitle', {number: index + 1}),
        icon: L.divIcon({ className: 'map-vertex', html: String(index + 1), iconSize: [26, 26], iconAnchor: [13, 13] }),
      }).addTo(group);
      marker.on('dragend', () => {
        const moved = marker.getLatLng();
        onVerticesChange(vertices.map((value, i) => i === index ? [moved.lng, moved.lat] : value));
      });
    });
    function addObject(feature, item, color) {
      const active = selected?.id === item.id || selected?.feature?.id === item.id
        || (selected?.kind === 'property' && selected.addresses.some((a) => a.id === item.id));
      const layer = L.geoJSON(feature, {
        style: { color: active ? '#b33b24' : color, weight: active ? 6 : 3, fillOpacity: 0.12,
          dashArray: item.kind === 'hamlet' && !item.reviewed ? '6 5' : undefined },
        pointToLayer: (_, coordinates) => L.circleMarker(coordinates, { radius: active ? 9 : 6, color: active ? '#b33b24' : color, fillOpacity: 0.9, weight: 2 }),
      }).addTo(group);
      const label = document.createElement('span');
      label.textContent = `${item.address || item.name || t('unnamed')} · ${item.source}${item.kind === 'hamlet' && !item.reviewed ? ` · ${t('draftLabel')}` : ''}`;
      layer.bindTooltip(label);
      layer.on('click', () => { if (!drawing && !editing) onSelect(item); });
    }
    if (layers.hamlets) hamlets.filter((h) => h.polygon).forEach((h) => addObject(h.polygon,
      { ...h, id: `hamlet:${h.id}`, kind: 'hamlet', feature: h.polygon }, '#a34235'));
    if (layers.addresses) addresses.forEach((item) => addObject(item.feature, item, '#20636c'));
    if (layers.roads) roads.forEach((item) => addObject({ type: 'Feature', properties: {}, geometry: item.geometry }, item, '#826736'));
    if (layers.register) registerPoints.forEach((item) => addObject(item.feature, item, '#665493'));
    if (layers.boundaries) boundaries.forEach((item) => addObject(item.feature, item, '#38724b'));
  }, [vertices, drawing, editing, addresses, roads, registerPoints, boundaries, hamlets, layers, selected, onVerticesChange, onSelect, t]);

  useEffect(() => {
    const geometry = selected?.feature?.geometry || selected?.geometry;
    if (!geometry) return;
    const bounds = L.geoJSON({ type: 'Feature', properties: {}, geometry }).getBounds();
    if (bounds.isValid()) mapRef.current.fitBounds(bounds, { maxZoom: 17, padding: [40, 40] });
  }, [selected]);

  return <div>
    <div ref={container} className="map-explorer-canvas" aria-label={t('canvasLabel')} />
    {drawing && <button type="button" className="admin-button" onClick={() => {
      const center = mapRef.current.getCenter();
      onVerticesChange([...vertices, [center.lng, center.lat]]);
    }}>{t('addCenterPoint')}</button>}
  </div>;
}

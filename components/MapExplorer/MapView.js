'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TURUFJELL_CENTER } from '@/lib/map/geo';
import { BACKGROUND_MAP } from '@/lib/map/sources';

const latLng = ([lon, lat]) => [lat, lon];

export default function MapView({ vertices, drawing, editing, onVerticesChange, addresses = [], roads = [], registerPoints = [], boundaries = [], layers, selected, onSelect, onError }) {
  const container = useRef(null);
  const mapRef = useRef(null);
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
      if (!warned) latest.current.onError('Bakgrunnskartet kunne ikke lastes. Last siden på nytt for å prøve igjen.');
      warned = true;
    });
    overlay.current = L.featureGroup().addTo(map);
    map.on('click', (event) => {
      const current = latest.current;
      if (current.drawing) current.onVerticesChange([...current.vertices, [event.latlng.lng, event.latlng.lat]]);
    });
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

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
        title: `Polygonpunkt ${index + 1}. Kan også endres i koordinatlisten.`,
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
        style: { color: active ? '#b33b24' : color, weight: active ? 6 : 3, fillOpacity: 0.12 },
        pointToLayer: (_, coordinates) => L.circleMarker(coordinates, { radius: active ? 9 : 6, color: active ? '#b33b24' : color, fillOpacity: 0.9, weight: 2 }),
      }).addTo(group);
      const label = document.createElement('span');
      label.textContent = `${item.address || item.name || 'Uten navn'} · ${item.source}`;
      layer.bindTooltip(label);
      layer.on('click', () => { if (!drawing && !editing) onSelect(item); });
    }
    if (layers.addresses) addresses.forEach((item) => addObject(item.feature, item, '#20636c'));
    if (layers.roads) roads.forEach((item) => addObject({ type: 'Feature', properties: {}, geometry: item.geometry }, item, '#826736'));
    if (layers.register) registerPoints.forEach((item) => addObject(item.feature, item, '#665493'));
    if (layers.boundaries) boundaries.forEach((item) => addObject(item.feature, item, '#38724b'));
  }, [vertices, drawing, editing, addresses, roads, registerPoints, boundaries, layers, selected, onVerticesChange, onSelect]);

  useEffect(() => {
    const geometry = selected?.feature?.geometry || selected?.geometry;
    if (!geometry) return;
    const bounds = L.geoJSON({ type: 'Feature', properties: {}, geometry }).getBounds();
    if (bounds.isValid()) mapRef.current.fitBounds(bounds, { maxZoom: 17, padding: [40, 40] });
  }, [selected]);

  return <div>
    <div ref={container} className="map-explorer-canvas" aria-label="Kart over Turufjell. Polygonet kan også redigeres med koordinatfeltene." />
    {drawing && <button type="button" className="admin-button" onClick={() => {
      const center = mapRef.current.getCenter();
      onVerticesChange([...vertices, [center.lng, center.lat]]);
    }}>Legg til punkt i kartsenter (kartet flyttes med piltastene)</button>}
  </div>;
}

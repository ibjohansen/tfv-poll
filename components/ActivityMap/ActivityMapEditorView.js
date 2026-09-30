'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ACTIVITY_MAP_CENTER, activityGeometryKind } from '@/lib/activity-map';
import { BACKGROUND_MAP, SATELLITE_MAP } from '@/lib/map/sources';

const latLng = ([longitude, latitude]) => [latitude, longitude];
const colors = { cycling: '#16745a', alpine: '#7d3147' };
const polygonVertexIcon = L.divIcon({
  className: 'activity-polygon-vertex', html: '<span aria-hidden="true">+</span>', iconSize: [24, 24], iconAnchor: [12, 12],
});

export default function ActivityMapEditorView({ features, draft, drawing, editing, onSelect, onGeometryChange, onError, labels }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const baseLayers = useRef(null);
  const layers = useRef(null);
  const [baseMap, setBaseMap] = useState('topographic');
  const latest = useRef({ draft, drawing, onGeometryChange, onError });
  useEffect(() => { latest.current = { draft, drawing, onGeometryChange, onError }; }, [draft, drawing, onGeometryChange, onError]);

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false, zoomControl: false }).setView(latLng(ACTIVITY_MAP_CENTER), 16);
    mapRef.current = map;
    L.control.zoom({ zoomInTitle: labels.zoomIn, zoomOutTitle: labels.zoomOut }).addTo(map);
    map.attributionControl.setPrefix(false);
    const topographic = L.tileLayer(BACKGROUND_MAP.url, { attribution: BACKGROUND_MAP.attribution, maxZoom: BACKGROUND_MAP.maxZoom }).addTo(map);
    const satellite = L.tileLayer(SATELLITE_MAP.url, { attribution: SATELLITE_MAP.attribution, maxZoom: SATELLITE_MAP.maxZoom });
    baseLayers.current = { topographic, satellite };
    let warned = false;
    const warn = () => { if (!warned) latest.current.onError(labels.tileError); warned = true; };
    topographic.on('tileerror', warn);
    satellite.on('tileerror', warn);
    layers.current = L.featureGroup().addTo(map);
    map.on('click', ({ latlng }) => {
      const current = latest.current;
      if (!current.drawing) return;
      const point = [latlng.lng, latlng.lat];
      if (activityGeometryKind(current.draft.featureType) === 'polygon') {
        const ring = current.draft.geometry?.type === 'Polygon' ? current.draft.geometry.coordinates[0] : [];
        current.onGeometryChange({ type: 'Polygon', coordinates: [[...ring, point]] });
      } else current.onGeometryChange({ type: 'Point', coordinates: point });
    });
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; baseLayers.current = null; };
  }, [labels]);

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
    for (const feature of features) {
      if (feature.id === draft.id || !feature.geometry) continue;
      const layer = L.geoJSON({ type: 'Feature', properties: {}, geometry: feature.geometry }, {
        style: { color: colors[feature.category], weight: 3, fillOpacity: .18 },
        pointToLayer: (_item, point) => L.circleMarker(point, { radius: 8, color: colors.alpine, fillColor: '#fff', fillOpacity: .95, weight: 3 }),
      }).addTo(group);
      layer.bindTooltip(feature.name);
      layer.on('click', () => { if (!drawing && !editing) onSelect(feature); });
    }
    if (!draft.geometry) return;
    const currentStyle = { color: '#6b4ea0', weight: 4, fillColor: '#ad96d7', fillOpacity: .24, dashArray: drawing ? '7 5' : undefined };
    L.geoJSON({ type: 'Feature', properties: {}, geometry: draft.geometry }, {
      style: currentStyle,
      pointToLayer: (_item, point) => L.circleMarker(point, { ...currentStyle, radius: 10, fillOpacity: .9 }),
    }).addTo(group);
    if ((drawing || editing) && draft.geometry.type === 'Polygon') {
      const ring = draft.geometry.coordinates[0];
      const vertices = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
      vertices.forEach((coordinate, index) => L.marker(latLng(coordinate), {
        draggable: editing, interactive: editing, icon: polygonVertexIcon, title: labels.polygonPoint(index + 1),
      }).addTo(group)
        .on('dragend', (event) => {
          const point = event.target.getLatLng();
          const next = vertices.map((value, position) => position === index ? [point.lng, point.lat] : value);
          onGeometryChange({ type: 'Polygon', coordinates: [editing ? [...next, next[0]] : next] });
        }));
    }
    if (editing && draft.geometry.type === 'Point') {
      L.marker(latLng(draft.geometry.coordinates), { draggable: true, title: draft.name || labels.activityPoint }).addTo(group)
        .on('dragend', (event) => { const point = event.target.getLatLng(); onGeometryChange({ type: 'Point', coordinates: [point.lng, point.lat] }); });
    }
  }, [draft, drawing, editing, features, labels, onGeometryChange, onSelect]);

  return <><div ref={container} className={`activity-admin-map${drawing ? ' is-drawing' : ''}`} aria-label={labels.canvas} />
    <label className="activity-map-layer-control"><span>{labels.baseMap}</span><select value={baseMap} onChange={(event) => setBaseMap(event.target.value)}>
      <option value="topographic">{labels.topographicMap}</option><option value="satellite">{labels.satelliteMap}</option>
    </select></label></>;
}

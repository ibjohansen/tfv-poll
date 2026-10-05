'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ACTIVITY_MAP_CENTER } from '@/lib/activity-map-display';
import { activityCategoryColor } from '@/lib/activity-map-catalog';
import { BACKGROUND_MAP, SATELLITE_MAP } from '@/lib/map/sources';
import { revealLeafletLayerWithoutZoom } from '@/lib/map/leaflet-viewport';
import { activityMapIconAnchor, activityMapIconCoordinate, activityMapIconKind, activityMapIconMarkup } from '@/lib/activity-map-icons';

const latLng = ([longitude, latitude]) => [latitude, longitude];
const geometryVertexIcon = L.divIcon({
  className: 'activity-geometry-vertex', html: '<span aria-hidden="true">×</span>', iconSize: [24, 24], iconAnchor: [12, 12],
});
const geometryMidpointIcon = L.divIcon({
  className: 'activity-geometry-midpoint', html: '<span aria-hidden="true">+</span>', iconSize: [22, 22], iconAnchor: [11, 11],
});
const selectedGeometryHaloStyle = {
  className: 'activity-map-selected-halo', color: '#fffdf8', weight: 11, opacity: .95,
  fillOpacity: 0, interactive: false, lineCap: 'round', lineJoin: 'round',
};
const selectedGeometryStyle = {
  className: 'activity-map-selected-geometry', color: '#c92f2f', weight: 6, opacity: 1,
  fillColor: '#ef8f8f', fillOpacity: .28, lineCap: 'round', lineJoin: 'round',
};

function verticesForGeometry(geometry) {
  if (geometry.type === 'LineString') return geometry.coordinates;
  const ring = geometry.coordinates[0];
  return ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
}

function geometryWithVertices(type, vertices, closed) {
  return type === 'Polygon'
    ? { type, coordinates: [closed && vertices.length ? [...vertices, vertices[0]] : vertices] }
    : { type, coordinates: vertices };
}

function fitVisibleGeometry(map, bounds) {
  if (!map || !bounds) return;
  if (bounds.isValid()) map.fitBounds(bounds, { animate: false, maxZoom: 17, padding: [42, 42] });
  else map.setView(latLng(ACTIVITY_MAP_CENTER), 16, { animate: false });
}

function activityCategoryIcon(feature, selected = false) {
  const kind = activityMapIconKind(feature);
  return L.divIcon({
    className: `activity-map-category-icon is-${kind}${selected ? ' is-selected' : ''}`,
    html: activityMapIconMarkup(feature), iconSize: [30, 30], iconAnchor: activityMapIconAnchor(feature),
  });
}

export default function ActivityMapEditorView({ features, previewFeatures = [], draft, drawing, editing, onSelect, onGeometryChange, onError, labels }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const baseLayers = useRef(null);
  const layers = useRef(null);
  const featureLayers = useRef(new Map());
  const visibleBoundsRef = useRef(null);
  const [baseMap, setBaseMap] = useState('topographic');
  const labelsRef = useRef(labels);
  const latest = useRef({ draft, drawing, onGeometryChange, onError });
  useEffect(() => { latest.current = { draft, drawing, onGeometryChange, onError }; }, [draft, drawing, onGeometryChange, onError]);
  useEffect(() => { labelsRef.current = labels; }, [labels]);

  useEffect(() => {
    const mapLabels = labelsRef.current;
    const map = L.map(container.current, { scrollWheelZoom: false, zoomControl: false }).setView(latLng(ACTIVITY_MAP_CENTER), 16);
    mapRef.current = map;
    L.control.zoom({ zoomInTitle: mapLabels.zoomIn, zoomOutTitle: mapLabels.zoomOut }).addTo(map);
    map.attributionControl.setPrefix(false);
    const topographic = L.tileLayer(BACKGROUND_MAP.url, { attribution: BACKGROUND_MAP.attribution, maxZoom: BACKGROUND_MAP.maxZoom }).addTo(map);
    const satellite = L.tileLayer(SATELLITE_MAP.url, { attribution: SATELLITE_MAP.attribution, maxZoom: SATELLITE_MAP.maxZoom });
    baseLayers.current = { topographic, satellite };
    let warned = false;
    const warn = () => { if (!warned) latest.current.onError(labelsRef.current.tileError); warned = true; };
    topographic.on('tileerror', warn);
    satellite.on('tileerror', warn);
    layers.current = L.featureGroup().addTo(map);
    const syncZoomLevel = () => { map.getContainer().dataset.zoomLevel = String(map.getZoom()); };
    map.on('zoomend', syncZoomLevel);
    syncZoomLevel();
    map.on('click', ({ latlng }) => {
      const current = latest.current;
      if (!current.drawing) return;
      const point = [latlng.lng, latlng.lat];
      if (current.draft.geometryKind === 'polygon') {
        const ring = current.draft.geometry?.type === 'Polygon' ? current.draft.geometry.coordinates[0] : [];
        current.onGeometryChange({ type: 'Polygon', coordinates: [[...ring, point]] });
      } else if (current.draft.geometryKind === 'line') {
        const points = current.draft.geometry?.type === 'LineString' ? current.draft.geometry.coordinates : [];
        current.onGeometryChange({ type: 'LineString', coordinates: [...points, point] });
      } else current.onGeometryChange({ type: 'Point', coordinates: point });
    });
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    requestAnimationFrame(() => map.invalidateSize());
    return () => { resize.disconnect(); map.off('zoomend', syncZoomLevel); map.remove(); mapRef.current = null; baseLayers.current = null; };
  }, []);

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
    const visibleBounds = L.latLngBounds();
    for (const feature of features) {
      if (feature.id === draft.id || !feature.geometry) continue;
      const layer = L.geoJSON({ type: 'Feature', properties: {}, geometry: feature.geometry }, {
        style: { className: 'activity-map-visible-feature', color: activityCategoryColor(feature), weight: 3, fillOpacity: .18 },
        pointToLayer: (_item, point) => L.circleMarker(point, { radius: 8, color: activityCategoryColor(feature), fillColor: '#fff', fillOpacity: .95, weight: 3 }),
      }).addTo(group);
      visibleBounds.extend(layer.getBounds());
      const iconCoordinate = activityMapIconCoordinate(feature.geometry);
      if (iconCoordinate) L.marker(latLng(iconCoordinate), { icon: activityCategoryIcon(feature), interactive: false, keyboard: false }).addTo(group);
      layer.eachLayer((item) => item.getElement()?.setAttribute('data-feature-id', feature.id));
      featureLayers.current.set(feature.id, layer);
      const tooltip = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = feature.name;
      tooltip.append(name);
      if (feature.tooltipText) {
        const description = document.createElement('p');
        description.textContent = feature.tooltipText;
        tooltip.append(description);
      }
      layer.bindTooltip(tooltip);
      layer.on('click', () => { if (!drawing && !editing) onSelect(feature); });
    }
    for (const candidate of previewFeatures) {
      if (!candidate.geometry) continue;
      const color = candidate.sourceId === 'kartverket' ? '#2563a8' : '#7a4c9e';
      const layer = L.geoJSON({ type: 'Feature', properties: {}, geometry: candidate.geometry }, {
        interactive: false, style: { color, weight: 4, opacity: .8, dashArray: '8 6' },
      }).addTo(group);
      layer.bindTooltip(labels.importPreview({ name: candidate.name, source: candidate.sourceName }));
    }
    if (!draft.geometry) {
      visibleBoundsRef.current = visibleBounds;
      return;
    }
    L.geoJSON({ type: 'Feature', properties: {}, geometry: draft.geometry }, {
      style: selectedGeometryHaloStyle,
      pointToLayer: (_item, point) => L.circleMarker(point, {
        ...selectedGeometryHaloStyle, radius: 15, fillColor: '#fffdf8', fillOpacity: .95, weight: 3,
      }),
    }).addTo(group);
    const currentStyle = { ...selectedGeometryStyle, dashArray: drawing ? '7 5' : undefined };
    const selectedLayer = L.geoJSON({ type: 'Feature', properties: {}, geometry: draft.geometry }, {
      style: currentStyle,
      pointToLayer: (_item, point) => L.circleMarker(point, { ...currentStyle, radius: 10, fillOpacity: .95 }),
    }).addTo(group);
    const selectedIconCoordinate = activityMapIconCoordinate(draft.geometry);
    if (selectedIconCoordinate) L.marker(latLng(selectedIconCoordinate), { icon: activityCategoryIcon(draft, true), interactive: false, keyboard: false }).addTo(group);
    visibleBounds.extend(selectedLayer.getBounds());
    if (draft.id) featureLayers.current.set(draft.id, selectedLayer);
    if ((drawing || editing) && (draft.geometry.type === 'Polygon' || draft.geometry.type === 'LineString')) {
      const vertices = verticesForGeometry(draft.geometry);
      const closed = editing && draft.geometry.type === 'Polygon';
      const minimum = draft.geometry.type === 'Polygon' ? 3 : 2;
      vertices.forEach((coordinate, index) => L.marker(latLng(coordinate), {
        draggable: editing, interactive: true, bubblingMouseEvents: false, icon: geometryVertexIcon,
        title: editing || vertices.length > minimum ? labels.removeGeometryPoint(index + 1) : labels.geometryPoint(index + 1),
      }).addTo(group)
        .on('dragend', (event) => {
          const point = event.target.getLatLng();
          const next = vertices.map((value, position) => position === index ? [point.lng, point.lat] : value);
          onGeometryChange(geometryWithVertices(draft.geometry.type, next, closed));
        })
        .on('click', () => {
          if (editing && vertices.length <= minimum) return;
          const next = vertices.filter((_value, position) => position !== index);
          onGeometryChange(next.length ? geometryWithVertices(draft.geometry.type, next, closed) : null);
        }));
      if (editing) {
        const segmentCount = draft.geometry.type === 'Polygon' ? vertices.length : vertices.length - 1;
        for (let index = 0; index < segmentCount; index += 1) {
          const nextIndex = (index + 1) % vertices.length;
          const midpoint = [(vertices[index][0] + vertices[nextIndex][0]) / 2, (vertices[index][1] + vertices[nextIndex][1]) / 2];
          L.marker(latLng(midpoint), { interactive: true, bubblingMouseEvents: false, icon: geometryMidpointIcon, title: labels.addGeometryPoint })
            .addTo(group).on('click', () => {
              const next = [...vertices.slice(0, index + 1), midpoint, ...vertices.slice(index + 1)];
              onGeometryChange(geometryWithVertices(draft.geometry.type, next, closed));
            });
        }
      }
    }
    if (editing && draft.geometry.type === 'Point') {
      L.marker(latLng(draft.geometry.coordinates), { draggable: true, title: draft.name || labels.activityPoint }).addTo(group)
        .on('dragend', (event) => { const point = event.target.getLatLng(); onGeometryChange({ type: 'Point', coordinates: [point.lng, point.lat] }); });
    }
    visibleBoundsRef.current = visibleBounds;
  }, [draft, drawing, editing, features, labels, onGeometryChange, onSelect, previewFeatures]);

  useEffect(() => {
    if (!drawing && !editing && visibleBoundsRef.current) fitVisibleGeometry(mapRef.current, visibleBoundsRef.current);
  }, [drawing, editing, features]);

  useEffect(() => {
    if (!drawing && !editing && draft.id) revealLeafletLayerWithoutZoom(mapRef.current, featureLayers.current.get(draft.id));
  }, [draft.id, drawing, editing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Leaflet owns the container's classes. Replacing className in JSX removes
    // leaflet-container and its tile sizing rules when drawing is toggled.
    map.getContainer().classList.toggle('is-drawing', drawing);
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(frame);
  }, [drawing, editing]);

  return <><div ref={container} className="activity-admin-map" aria-label={labels.canvas} />
    <label className="activity-map-layer-control"><span>{labels.baseMap}</span><select value={baseMap} onChange={(event) => setBaseMap(event.target.value)}>
      <option value="topographic">{labels.topographicMap}</option><option value="satellite">{labels.satelliteMap}</option>
    </select></label></>;
}

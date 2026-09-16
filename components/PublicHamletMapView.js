'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TURUFJELL_CENTER } from '@/lib/map/geo';
import { BACKGROUND_MAP } from '@/lib/map/sources';

const latLng = ([longitude, latitude]) => [latitude, longitude];

export default function PublicHamletMapView({ hamlets, activeHamlet, properties, selectedProperty, onSelectHamlet, onSelectProperty, onError }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const overlays = useRef(null);
  const latestError = useRef(onError);

  useEffect(() => { latestError.current = onError; }, [onError]);
  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(latLng(TURUFJELL_CENTER), 14);
    mapRef.current = map;
    const tiles = L.tileLayer(BACKGROUND_MAP.url, { attribution: BACKGROUND_MAP.attribution, maxZoom: BACKGROUND_MAP.maxZoom }).addTo(map);
    let warned = false;
    tiles.on('tileerror', () => {
      if (!warned) latestError.current('Bakgrunnskartet kunne ikke lastes. Prøv igjen senere.');
      warned = true;
    });
    overlays.current = L.featureGroup().addTo(map);
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

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

  return <div ref={container} className="public-hamlet-map" aria-label="Kart over grender og registrerte eiendommer på Turufjell" />;
}

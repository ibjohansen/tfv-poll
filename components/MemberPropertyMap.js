'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';

const PLACE_NAME = 'Flå';

function mapUrl(streetAddress, coordinates) {
  const search = `${streetAddress}, ${PLACE_NAME}`;
  const parameters = new URLSearchParams({ project: 'seeiendom', sok: search });
  if (coordinates) {
    parameters.set('zoom', '16');
    parameters.set('lat', String(coordinates.north));
    parameters.set('lon', String(coordinates.east));
    parameters.set('markerLat', String(coordinates.north));
    parameters.set('markerLon', String(coordinates.east));
    parameters.set('showSelection', 'true');
  }
  return `https://norgeskart.no/#!?${parameters}`;
}

function MapFrame({ coordinates, streetAddress, title, loadingLabel }) {
  if (coordinates === undefined) return <div className="member-map-loading" role="status">{loadingLabel}</div>;
  return (
    <iframe
      className="member-map-frame"
      src={mapUrl(streetAddress, coordinates)}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      allowFullScreen
    />
  );
}

export default function MemberPropertyMap({ streetAddress }) {
  const { t } = useI18n('members.propertyMap');
  const [coordinates, setCoordinates] = useState();

  useEffect(() => {
    const controller = new AbortController();
    async function findProperty() {
      try {
        const addressParameters = new URLSearchParams({ sok: `${streetAddress} ${PLACE_NAME}`, treffPerSide: '1' });
        const addressResponse = await fetch(`https://ws.geonorge.no/adresser/v1/sok?${addressParameters}`, { signal: controller.signal });
        if (!addressResponse.ok) throw new Error('Address lookup failed');
        const point = (await addressResponse.json()).adresser?.[0]?.representasjonspunkt;
        if (!point || point.epsg !== 'EPSG:4258') throw new Error('Address coordinates missing');
        const transformParameters = new URLSearchParams({ x: String(point.lon), y: String(point.lat), fra: '4258', til: '25833' });
        const transformResponse = await fetch(`https://ws.geonorge.no/transformering/v1/transformer?${transformParameters}`, { signal: controller.signal });
        if (!transformResponse.ok) throw new Error('Coordinate transformation failed');
        const transformed = await transformResponse.json();
        if (!Number.isFinite(transformed.x) || !Number.isFinite(transformed.y)) throw new Error('Transformed coordinates missing');
        setCoordinates({ east: transformed.x, north: transformed.y });
      } catch (error) {
        if (error.name !== 'AbortError') setCoordinates(null);
      }
    }
    findProperty();
    return () => controller.abort();
  }, [streetAddress]);

  if (!streetAddress) return null;

  return (
    <details className="member-map">
      <summary className="member-map-heading">
        <div>
          <strong>{t('title')}</strong>
          <span>{streetAddress}, {PLACE_NAME}</span>
        </div>
        <span className="member-map-toggle" aria-hidden="true">{t('show')}</span>
      </summary>
      <div className="member-map-content"><MapFrame coordinates={coordinates} streetAddress={streetAddress} title={t('frameTitle', {address: streetAddress})} loadingLabel={t('loading')} />
        <a className="member-map-source" href={mapUrl(streetAddress, coordinates)} target="_blank" rel="noreferrer">{t('open')}</a></div>
    </details>
  );
}

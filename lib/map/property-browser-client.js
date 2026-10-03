export const PROPERTY_MAP_PLACE = 'Flå';

export function propertyMapUrl(streetAddress, coordinates) {
  const parameters = new URLSearchParams({ project: 'seeiendom', sok: `${streetAddress}, ${PROPERTY_MAP_PLACE}` });
  if (coordinates) {
    parameters.set('zoom', '16');
    parameters.set('lat', String(coordinates.north)); parameters.set('lon', String(coordinates.east));
    parameters.set('markerLat', String(coordinates.north)); parameters.set('markerLon', String(coordinates.east));
    parameters.set('showSelection', 'true');
  }
  return `https://norgeskart.no/#!?${parameters}`;
}

// Called only after an explicit user action; no personal data in shared caches.
export async function locateProperty(streetAddress, signal, fetchImpl = fetch) {
  const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  const lookup = async (path, parameters) => {
    const response = await fetchImpl(`https://ws.geonorge.no/${path}?${parameters}`, {
      signal: bounded, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
    });
    if (!response.ok) throw new Error('PROPERTY_MAP_UNAVAILABLE');
    return response.json();
  };
  const address = await lookup('adresser/v1/sok', new URLSearchParams({ sok: `${streetAddress} ${PROPERTY_MAP_PLACE}`, treffPerSide: '1' }));
  const point = address.adresser?.[0]?.representasjonspunkt;
  if (!point || point.epsg !== 'EPSG:4258' || !Number.isFinite(point.lon) || !Number.isFinite(point.lat)) throw new Error('PROPERTY_MAP_COORDINATES');
  const transformed = await lookup('transformering/v1/transformer', new URLSearchParams({ x: String(point.lon), y: String(point.lat), fra: '4258', til: '25833' }));
  if (!Number.isFinite(transformed.x) || !Number.isFinite(transformed.y)) throw new Error('PROPERTY_MAP_COORDINATES');
  return { east: transformed.x, north: transformed.y };
}

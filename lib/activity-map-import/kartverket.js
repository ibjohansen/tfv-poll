import { createHash } from 'node:crypto';
import { SaxesParser } from 'saxes';
import unzipper from 'unzipper';
import { MapError } from '../map/errors.js';
import { fetchMapJson } from '../map/http.js';
import { ACTIVITY_IMPORT_BBOX, ACTIVITY_IMPORT_MAX_COORDINATES, normalizeSourceText } from './geometry.js';

const DOWNLOAD_ORIGIN = 'https://nedlasting.geonorge.no';
const DATASET_ID = 'd1422d17-6d95-4ef1-96ab-8af31744dd63';
const MAX_COMPRESSED_BYTES = 25_000_000;
const MAX_UNCOMPRESSED_BYTES = 100_000_000;
const MAX_ROUTES = 10_000;
const MAX_ACTIVITY_NAME_LENGTH = 160;

function routeDisplayName(route, index) {
  const description = normalizeSourceText(route.description, MAX_ACTIVITY_NAME_LENGTH);
  const sourceName = normalizeSourceText(route.name, MAX_ACTIVITY_NAME_LENGTH);
  const usefulSourceName = sourceName?.toLocaleLowerCase('nb-NO') === 'ukjent' ? null : sourceName;
  if (description && usefulSourceName) {
    const displayedSourceName = normalizeSourceText(usefulSourceName, MAX_ACTIVITY_NAME_LENGTH - 4);
    const descriptionLength = MAX_ACTIVITY_NAME_LENGTH - displayedSourceName.length - 3;
    return `${normalizeSourceText(description, descriptionLength)} (${displayedSourceName})`;
  }
  return description || usefulSourceName || `Kartverket ${index + 1}`;
}

function routeIntersectsImportBounds(coordinates) {
  const [west, south, east, north] = ACTIVITY_IMPORT_BBOX;
  let minLongitude = Infinity; let minLatitude = Infinity; let maxLongitude = -Infinity; let maxLatitude = -Infinity;
  for (const [longitude, latitude] of coordinates) {
    minLongitude = Math.min(minLongitude, longitude); maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude); maxLatitude = Math.max(maxLatitude, latitude);
  }
  return minLongitude <= east && maxLongitude >= west && minLatitude <= north && maxLatitude >= south;
}

async function readLimitedBuffer(response, maxBytes) {
  if (Number(response.headers.get('content-length')) > maxBytes) throw new MapError('errors.activityImportTooLarge', 413);
  const reader = response.body?.getReader();
  if (!reader) throw new MapError('errors.emptyResponse', 502);
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new MapError('errors.activityImportTooLarge', 413);
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, bytes);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function pickBuskerudGpx(areas) {
  const area = Array.isArray(areas) ? areas.find((entry) => entry?.code === '33' && entry?.type === 'fylke') : null;
  if (!area) throw new MapError('errors.activityImportKartverketFormat', 502);
  const format = area.formats?.find((entry) => entry?.name?.trim().toUpperCase() === 'GPX');
  const projection = format?.projections?.find((entry) => String(entry?.code) === '4326')
    || area.projections?.find((entry) => String(entry?.code) === '4326' && entry.formats?.some((entry) => entry?.name?.trim().toUpperCase() === 'GPX'));
  if (!format || !projection) throw new MapError('errors.activityImportKartverketFormat', 502);
  return { area: { code: area.code, type: area.type, name: area.name },
    format: { name: format.name }, projection: { code: projection.code, name: projection.name, codespace: projection.codespace } };
}

function parseGpxEntry(entry) {
  return new Promise((resolve, reject) => {
    const routes = [];
    let route = null;
    let field = null;
    let text = '';
    let bytes = 0;
    let coordinateCount = 0;
    const parser = new SaxesParser({ xmlns: false });
    parser.on('opentag', (node) => {
      const name = node.name.toLowerCase();
      if (name === 'rte') route = { name: null, description: null, operator: null, type: null, coordinates: [] };
      if (!route) return;
      if (['name', 'desc', 'src', 'type'].includes(name)) { field = name; text = ''; }
      if (name === 'rtept') {
        const latitude = Number(node.attributes.lat);
        const longitude = Number(node.attributes.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
          throw new MapError('errors.activityImportSourceData', 502);
        }
        route.coordinates.push([longitude, latitude]);
        if (route.coordinates.length > ACTIVITY_IMPORT_MAX_COORDINATES) throw new MapError('errors.activityImportTooLarge', 413);
      }
    });
    parser.on('text', (value) => { if (field) text += value; });
    parser.on('doctype', () => { throw new MapError('errors.activityImportSourceData', 502); });
    parser.on('closetag', ({ name: rawName }) => {
      const name = rawName.toLowerCase();
      if (route && field === name) {
        const value = normalizeSourceText(text, field === 'desc' ? 300 : 160);
        if (field === 'name') route.name = value;
        if (field === 'desc') route.description = value;
        if (field === 'src') route.operator = value;
        if (field === 'type') route.type = value;
        field = null; text = '';
      }
      if (name === 'rte' && route) {
        const inBounds = route.coordinates.length && routeIntersectsImportBounds(route.coordinates);
        if (route.type?.toLocaleLowerCase('nb-NO') === 'skiløype' && route.coordinates.length >= 2 && inBounds) {
          coordinateCount += route.coordinates.length;
          if (coordinateCount > ACTIVITY_IMPORT_MAX_COORDINATES) throw new MapError('errors.activityImportTooLarge', 413);
          routes.push(route);
        }
        route = null;
        if (routes.length > MAX_ROUTES) throw new MapError('errors.activityImportTooLarge', 413);
      }
    });
    parser.on('error', () => reject(new MapError('errors.activityImportSourceData', 502)));
    const stream = entry.stream();
    stream.on('data', (chunk) => {
      try {
        bytes += chunk.length;
        if (bytes > MAX_UNCOMPRESSED_BYTES) throw new MapError('errors.activityImportTooLarge', 413);
        parser.write(chunk.toString('utf8'));
      } catch (error) { stream.destroy(error); }
    });
    stream.on('error', (error) => reject(error instanceof MapError ? error : new MapError('errors.activityImportSourceData', 502)));
    stream.on('end', () => {
      try { parser.close(); resolve(routes); } catch (error) { reject(error instanceof MapError ? error : new MapError('errors.activityImportSourceData', 502)); }
    });
  });
}

export async function parseKartverketGpxZip(buffer) {
  let archive;
  try { archive = await unzipper.Open.buffer(buffer); } catch { throw new MapError('errors.activityImportSourceData', 502); }
  const entries = archive.files.filter((entry) => entry.type === 'File' && entry.path.toLocaleLowerCase('nb-NO').endsWith('.gpx'));
  if (entries.length !== 1 || entries[0].uncompressedSize > MAX_UNCOMPRESSED_BYTES) throw new MapError('errors.activityImportSourceData', 502);
  const routes = await parseGpxEntry(entries[0]);
  const occurrences = new Map();
  return routes.map((route, index) => {
    const stableName = normalizeSourceText(route.name, 140) || `route-${index + 1}`;
    const occurrence = (occurrences.get(stableName) || 0) + 1;
    occurrences.set(stableName, occurrence);
    return {
    sourceId: 'kartverket', externalId: `gpx:${stableName}${occurrence > 1 ? `:${occurrence}` : ''}`,
    sourceUrl: 'https://kartkatalog.geonorge.no/metadata/d1422d17-6d95-4ef1-96ab-8af31744dd63',
    name: routeDisplayName(route, index), matchName: normalizeSourceText(route.description, MAX_ACTIVITY_NAME_LENGTH),
    tooltipText: route.operator, operator: route.operator, websiteUrl: null, coordinates: route.coordinates,
  }; });
}

export async function fetchKartverketSkiRoutes({ fetchImpl = fetch, signal } = {}) {
  const areas = await fetchMapJson(`${DOWNLOAD_ORIGIN}/api/codelists/area/${DATASET_ID}`, {
    fetchImpl, signal, source: 'Kartverket/Geonorge', maxBytes: 2_000_000,
  });
  const selected = pickBuskerudGpx(areas);
  const order = await fetchMapJson(`${DOWNLOAD_ORIGIN}/api/order`, {
    fetchImpl, signal, source: 'Kartverket/Geonorge', method: 'POST', maxBytes: 1_000_000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderLines: [{ metadataUuid: DATASET_ID, areas: [selected.area], formats: [selected.format], projections: [selected.projection] }] }),
  });
  const file = order?.files?.find((entry) => entry?.status === 'ReadyForDownload' && entry?.format?.trim().toUpperCase() === 'GPX');
  if (!/^[0-9a-f-]{36}$/i.test(order?.referenceNumber || '') || !/^[0-9a-f-]{36}$/i.test(file?.fileId || '')) {
    throw new MapError('errors.activityImportKartverketUnavailable', 503);
  }
  const timeout = AbortSignal.timeout(45_000);
  let response;
  try {
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const options = {
      cache: 'no-store', redirect: 'manual', signal: requestSignal,
      headers: { Accept: 'application/zip', 'User-Agent': 'TurufjellVel-ActivityMap/1.0 (+https://medlemsservice.turufjellvel.no)' },
    };
    response = await fetchImpl(`${DOWNLOAD_ORIGIN}/api/download/order/${order.referenceNumber}/${file.fileId}`, options);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const redirectUrl = new URL(response.headers.get('location') || '', DOWNLOAD_ORIGIN);
      if (redirectUrl.origin !== DOWNLOAD_ORIGIN || !redirectUrl.pathname.startsWith('/geonorge/Friluftsliv/TurOgFriluftsruter/GPX/')) {
        throw new MapError('errors.activityImportSourceData', 502);
      }
      await response.body?.cancel();
      response = await fetchImpl(redirectUrl, { ...options, redirect: 'error' });
    }
  } catch (error) {
    if (error instanceof MapError) throw error;
    if (signal?.aborted) throw new MapError('errors.sourceTimeout', 504, { source: 'Kartverket/Geonorge' });
    throw new MapError('errors.sourceFetch', 502, { source: 'Kartverket/Geonorge' });
  }
  if (!response.ok) throw new MapError('errors.sourceFetch', 502, { source: 'Kartverket/Geonorge' });
  const buffer = await readLimitedBuffer(response, MAX_COMPRESSED_BYTES);
  return { sourceId: 'kartverket', lines: await parseKartverketGpxZip(buffer), rawSha256: createHash('sha256').update(buffer).digest('hex'), fetchedAt: new Date().toISOString() };
}

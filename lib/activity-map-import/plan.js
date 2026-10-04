import { ACTIVITY_MAP_CENTER } from '../activity-map-display.js';
import { CROSS_COUNTRY_CATEGORY } from '../activity-map-sources.js';
import { normalizeActivityFeatureInput } from '../activity-map.js';
import { MapError } from '../map/errors.js';
import { ACTIVITY_IMPORT_MAX_CANDIDATES, ACTIVITY_IMPORT_RADIUS_KM, candidatesMatch,
  normalizeSourceLine, sourceCandidateFingerprint, sha256 } from './geometry.js';

const IMPORT_CATALOG = {
  categories: [CROSS_COUNTRY_CATEGORY],
  types: [{ category: CROSS_COUNTRY_CATEGORY.id, ...CROSS_COUNTRY_CATEGORY.type }],
};

function candidateId(runId, sourceId, externalId) {
  return sha256(`${runId}\0${sourceId}\0${externalId}`).slice(0, 32);
}

function publicCandidate(candidate) {
  return {
    id: candidate.id, sourceId: candidate.sourceId, externalId: candidate.externalId,
    name: candidate.name, tooltipText: candidate.tooltipText, operator: candidate.operator,
    websiteUrl: candidate.websiteUrl, geometry: candidate.geometry, fingerprint: candidate.fingerprint,
    status: candidate.status, matchedFeatureId: candidate.matchedFeatureId,
    matchedFeatureName: candidate.matchedFeatureName || null,
    matchedItemId: candidate.matchedItemId, matchScore: candidate.matchScore,
    matchReason: candidate.matchReason,
  };
}

function countStatuses(candidates) {
  const summary = { total: candidates.length, new: 0, matched: 0, changed: 0, unchanged: 0, rejected: 0, missing: 0 };
  for (const candidate of candidates) summary[candidate.status] += 1;
  return summary;
}

function addRejected(rejected, line, reason) {
  rejected.push({ sourceId: line.sourceId, externalId: line.externalId, sourceExternalId: line.externalId,
    sourceUrl: line.sourceUrl || null, name: line.name, tooltipText: line.tooltipText || null,
    operator: line.operator || null, websiteUrl: line.websiteUrl || null,
    sourceGeometry: Array.isArray(line.coordinates) ? { type: 'LineString', coordinates: line.coordinates } : null,
    geometry: null, fingerprint: sha256(line), status: 'rejected', matchReason: reason });
}

function markCrossSourceMatches(candidates) {
  const kartverket = candidates.filter((candidate) => candidate.sourceId === 'kartverket' && candidate.status === 'new');
  const osm = candidates.filter((candidate) => candidate.sourceId === 'openstreetmap' && candidate.status === 'new');
  for (const candidate of osm) {
    let best = null;
    for (const primary of kartverket) {
      const result = candidatesMatch(primary, candidate);
      if (result.matched && (!best || result.score > best.score)) best = { primary, score: result.score };
    }
    if (best) {
      candidate.status = 'matched';
      candidate.matchedItemId = best.primary.id;
      candidate.matchScore = best.score;
      candidate.matchReason = 'name_and_geometry';
    }
  }
}

function markExistingFeatureMatches(candidates, existingFeatures) {
  for (const candidate of candidates.filter((item) => item.status === 'new')) {
    let best = null;
    for (const existing of existingFeatures) {
      if (existing.geometry?.type !== 'LineString') continue;
      const result = candidatesMatch(existing, candidate);
      if (result.matched && (!best || result.score > best.score)) best = { existing, score: result.score };
    }
    if (best) {
      candidate.status = 'matched';
      candidate.matchedFeatureId = best.existing.id;
      candidate.matchedFeatureName = best.existing.name;
      candidate.matchScore = best.score;
      candidate.matchReason = 'existing_name_and_geometry';
    }
  }
}

export function buildActivityImportPlan({ runId, sourceResults, existingLinks = [], existingFeatures = [] }) {
  const links = new Map(existingLinks.map((link) => [`${link.source_id}\0${link.external_id}`, link]));
  const seenLinks = new Set();
  const candidates = [];
  const rejected = [];
  for (const result of sourceResults) {
    for (const line of result.lines) {
      const normalized = normalizeSourceLine(line);
      if (normalized.rejection) { addRejected(rejected, line, normalized.rejection); continue; }
      for (const item of normalized.candidates) {
        const validated = normalizeActivityFeatureInput({ action: 'create', name: item.name, tooltipText: item.tooltipText,
          websiteUrl: item.websiteUrl, season: 'winter', category: CROSS_COUNTRY_CATEGORY.id,
          featureType: CROSS_COUNTRY_CATEGORY.type.id, geometry: item.geometry, isDraft: true }, IMPORT_CATALOG);
        const fingerprint = sourceCandidateFingerprint({ ...item, ...validated });
        const link = links.get(`${item.sourceId}\0${item.externalId}`);
        if (link) seenLinks.add(`${item.sourceId}\0${item.externalId}`);
        candidates.push({ ...item, name: validated.name, tooltipText: validated.tooltipText,
          websiteUrl: validated.websiteUrl, geometry: validated.geometry, fingerprint,
          status: !link ? 'new' : link.fingerprint === fingerprint ? 'unchanged' : 'changed',
          matchedFeatureId: link?.feature_id || null, matchedItemId: null, matchScore: null,
          matchedFeatureName: link?.feature_name || null, matchReason: link ? 'external_id' : null });
      }
    }
  }
  if (candidates.length + rejected.length > ACTIVITY_IMPORT_MAX_CANDIDATES) throw new MapError('errors.activityImportTooLarge', 413);
  const all = [...candidates, ...rejected];
  all.forEach((candidate) => { candidate.id = candidateId(runId, candidate.sourceId, candidate.externalId); });
  markCrossSourceMatches(candidates);
  markExistingFeatureMatches(candidates, existingFeatures);
  const missing = existingLinks.filter((link) => !seenLinks.has(`${link.source_id}\0${link.external_id}`))
    .map((link) => ({ id: candidateId(runId, link.source_id, link.external_id), sourceId: link.source_id,
      externalId: link.external_id, sourceExternalId: link.external_id, sourceUrl: link.source_url,
      name: link.feature_name || link.external_id, tooltipText: null, operator: null, websiteUrl: null,
      sourceGeometry: null, geometry: link.geometry || null, fingerprint: link.fingerprint,
      status: 'missing', matchedFeatureId: link.feature_id, matchedItemId: null,
      matchedFeatureName: link.feature_name || null, matchScore: null, matchReason: 'not_in_source' }));
  all.push(...missing);
  const summary = countStatuses(all);
  const sourceIds = [...new Set(sourceResults.map((result) => result.sourceId))].sort();
  const rawSha256 = sha256(sourceResults.map((result) => [result.sourceId, result.rawSha256]));
  const planSha256 = sha256(all.map((candidate) => ({ sourceId: candidate.sourceId, externalId: candidate.externalId,
    fingerprint: candidate.fingerprint, status: candidate.status, matchedFeatureId: candidate.matchedFeatureId,
    matchedItemId: candidate.matchedItemId })));
  const fetchedAt = sourceResults.map((result) => result.fetchedAt).sort().at(-1);
  return { runId, sourceIds, center: ACTIVITY_MAP_CENTER, radiusKm: ACTIVITY_IMPORT_RADIUS_KM,
    fetchedAt, rawSha256, planSha256, summary, candidates: all, publicCandidates: all.map(publicCandidate) };
}

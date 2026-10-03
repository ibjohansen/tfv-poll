import 'server-only';
import { unstable_cache } from 'next/cache';
import { PUBLIC_CMS_CACHE_TAG, PUBLIC_HAMLETS_CACHE_TAG, PUBLIC_ACTIVITY_MAP_CACHE_TAG } from './public-content-cache.js';

// Lazy adapters keep authentication, geometry processing and editor dependencies
// out of the cache-hit execution path. Only published, non-personal DTOs belong here.
export const getCachedPublishedCmsPageSummaries = unstable_cache(
  async () => (await import('./cms-pages.js')).getPublishedCmsPageSummaries(6),
  ['public-cms-summaries-v1'], { revalidate: 300, tags: [PUBLIC_CMS_CACHE_TAG] },
);
export const getCachedPublicMapHamlets = unstable_cache(
  async () => (await import('./map/public-map-service.js')).getPublicMapHamlets(),
  ['public-hamlets-v1'], { revalidate: 300, tags: [PUBLIC_HAMLETS_CACHE_TAG] },
);
export const getCachedPublicActivityMapFeatures = unstable_cache(
  async () => (await import('./activity-map-service.js')).getPublicActivityMapFeatures(),
  ['public-activities-season-website-v1'], { revalidate: 300, tags: [PUBLIC_ACTIVITY_MAP_CACHE_TAG] },
);
export const getCachedPublishedCmsPage = unstable_cache(
  async (slug) => (await import('./cms-pages.js')).getPublishedCmsPage(slug),
  ['public-cms-page-v1'], { revalidate: 300, tags: [PUBLIC_CMS_CACHE_TAG] },
);

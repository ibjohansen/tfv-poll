import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { unstable_cache } from 'next/cache';
import PublicHomePage from '@/components/PublicHomePage';
import { getPublishedCmsPageSummaries } from '@/lib/cms-pages';
import { getPublicMapHamlets } from '@/lib/map/public-map-service';
import { carouselImagesFromFilenames } from '@/lib/public-carousel';
import { PUBLIC_CMS_CACHE_TAG, PUBLIC_HAMLETS_CACHE_TAG } from '@/lib/public-content-cache';

export const runtime = 'nodejs';

async function getCarouselImages() {
  try {
    const filenames = await readdir(join(process.cwd(), 'public', 'carousel', 'optimized'));
    const optimized = carouselImagesFromFilenames(filenames, '/carousel/optimized');
    if (optimized.length) return optimized;
  } catch { /* Fall back to source images in development/test fixtures. */ }
  try {
    return carouselImagesFromFilenames(await readdir(join(process.cwd(), 'public', 'carousel')));
  } catch { return []; }
}

const getCachedCarouselImages = unstable_cache(getCarouselImages, ['home-carousel-images']);
const getCachedPublishedCmsPageSummaries = unstable_cache(
  () => getPublishedCmsPageSummaries(6),
  ['home-published-cms-pages'],
  { revalidate: 300, tags: [PUBLIC_CMS_CACHE_TAG] },
);
const getCachedPublicMapHamlets = unstable_cache(
  getPublicMapHamlets,
  ['home-public-map-hamlets'],
  { revalidate: 300, tags: [PUBLIC_HAMLETS_CACHE_TAG] },
);

async function safely(promise, fallback) {
  try { return await promise; } catch { return fallback; }
}

export default async function HomePage() {
  const [carouselImages, pages, hamlets] = await Promise.all([
    getCachedCarouselImages(),
    safely(getCachedPublishedCmsPageSummaries(), []),
    safely(getCachedPublicMapHamlets(), []),
  ]);
  return <PublicHomePage
    carouselImages={carouselImages.length ? carouselImages : [{ id: 'fallback', src: '/turufjell.jpeg', photographer: null, number: 0 }]}
    pages={pages}
    hamlets={JSON.parse(JSON.stringify(hamlets))}
  />;
}

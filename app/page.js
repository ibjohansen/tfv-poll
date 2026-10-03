import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { unstable_cache } from 'next/cache';
import PublicHomePage from '@/components/PublicHomePage';
import { getCachedPublishedCmsPageSummaries, getCachedPublicMapHamlets, getCachedPublicActivityMapFeatures } from '@/lib/public-queries';
import { carouselImagesFromFilenames } from '@/lib/public-carousel';

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
async function safely(promise, fallback) {
  try { return await promise; }
  catch { console.error('Public home data unavailable'); return fallback; }
}

export default async function HomePage({ searchParams }) {
  const showActivityMap = (await searchParams).maps === 'turutrollet';
  const [carouselImages, pages, hamlets, activityMapFeatures] = await Promise.all([
    getCachedCarouselImages(),
    safely(getCachedPublishedCmsPageSummaries(), []),
    safely(getCachedPublicMapHamlets(), []),
    showActivityMap ? safely(getCachedPublicActivityMapFeatures(), []) : null,
  ]);
  return <PublicHomePage
    carouselImages={carouselImages.length ? carouselImages : [{ id: 'fallback', src: '/turufjell.jpeg', photographer: null, number: 0 }]}
    pages={pages}
    hamlets={JSON.parse(JSON.stringify(hamlets))}
    activityMapFeatures={activityMapFeatures === null ? null : JSON.parse(JSON.stringify(activityMapFeatures))}
  />;
}

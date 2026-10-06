import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { unstable_cache } from 'next/cache';
import PublicHomePage from '@/components/PublicHomePage';
import { getCachedPublishedCmsPageSummaries, getCachedPublicMapHamlets, getCachedPublicActivityMapFeatures } from '@/lib/public-queries';
import { carouselImagesFromFilenames } from '@/lib/public-carousel';
import { getDictionary } from '@/locales';
import { DEFAULT_LOCALE } from '@/lib/i18n/config';
import { scopedTranslator } from '@/lib/i18n/translate';

export const runtime = 'nodejs';

const PUBLIC_SITE_URL = 'https://medlemsservice.turufjellvel.no';

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

async function getSocialCarouselImage() {
  try {
    const filenames = await readdir(join(process.cwd(), 'public', 'carousel'));
    return carouselImagesFromFilenames(filenames)[0] || null;
  } catch {
    return null;
  }
}

const getCachedSocialCarouselImage = unstable_cache(getSocialCarouselImage, ['home-social-carousel-image']);

export async function generateMetadata() {
  const messages = getDictionary(DEFAULT_LOCALE);
  const metadataT = scopedTranslator(messages, 'general.metadata');
  const carouselT = scopedTranslator(messages, 'public.carousel');
  const carouselImage = await getCachedSocialCarouselImage();
  const imagePath = carouselImage?.src || '/turufjell.jpeg';
  const imageUrl = new URL(imagePath, PUBLIC_SITE_URL).href;
  const imageAlt = carouselImage?.photographer
    ? carouselT('imageAlt', { name: carouselImage.photographer })
    : carouselT('landscapeAlt');
  const title = metadataT('title');
  const description = metadataT('description');

  return {
    alternates: { canonical: PUBLIC_SITE_URL },
    openGraph: {
      title,
      description,
      url: PUBLIC_SITE_URL,
      siteName: carouselT('eyebrow'),
      locale: 'nb_NO',
      type: 'website',
      images: [{
        url: imageUrl,
        width: carouselImage ? 1920 : 1600,
        height: carouselImage ? 1080 : 400,
        alt: imageAlt,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: imageUrl, alt: imageAlt }],
    },
  };
}

async function safely(promise, fallback) {
  try { return await promise; }
  catch { console.error('Public home data unavailable'); return fallback; }
}

export default async function HomePage() {
  const [carouselImages, pages, hamlets, activityMapFeatures] = await Promise.all([
    getCachedCarouselImages(),
    safely(getCachedPublishedCmsPageSummaries(), []),
    safely(getCachedPublicMapHamlets(), []),
    safely(getCachedPublicActivityMapFeatures(), []),
  ]);
  return <PublicHomePage
    carouselImages={carouselImages.length ? carouselImages : [{ id: 'fallback', src: '/turufjell.jpeg', photographer: null, number: 0 }]}
    pages={pages}
    hamlets={JSON.parse(JSON.stringify(hamlets))}
    activityMapFeatures={JSON.parse(JSON.stringify(activityMapFeatures))}
  />;
}

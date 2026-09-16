import 'server-only';
import { revalidateTag } from 'next/cache';

export const PUBLIC_CMS_CACHE_TAG = 'public-cms-content';
export const PUBLIC_HAMLETS_CACHE_TAG = 'public-map-hamlets';

export function revalidatePublicCmsContent() {
  revalidateTag(PUBLIC_CMS_CACHE_TAG, 'max');
}

export function revalidatePublicHamlets() {
  revalidateTag(PUBLIC_HAMLETS_CACHE_TAG, 'max');
}

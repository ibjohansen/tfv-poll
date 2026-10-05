import { downloadActivityMapImage, getActivityMapImage } from '@/lib/activity-map-image-service';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const image = await getActivityMapImage((await params).id);
    if (!image) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const token = image.storageKey.slice(image.storageKey.lastIndexOf('/') + 1, -'.webp'.length);
    if (request.nextUrl.searchParams.get('v') !== token) {
      return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const etag = `"activity-map-image-${token}"`;
    const headers = {
      ETag: etag,
      'Cache-Control': image.isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Content-Type': image.mimeType,
      'X-Content-Type-Options': 'nosniff',
    };
    if (image.isPublic && request.headers.get('if-none-match')?.split(',').map((value) => value.trim()).includes(etag)) {
      return new Response(null, { status: 304, headers });
    }
    const object = await downloadActivityMapImage(image);
    if (!object.Body) throw new Error('Missing image body');
    const bytes = await object.Body.transformToByteArray();
    return new Response(bytes, { headers: { ...headers, 'Content-Length': String(bytes.length) } });
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

import { downloadCmsObject } from '@/lib/cms-storage';
import { getAdminCmsFile, getPublicCmsFile } from '@/lib/cms-files';

export const runtime = 'nodejs';

function contentDisposition(filename, download) {
  const fallback = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'fil';
  return `${download ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function publicEtag(file) {
  return `"cms-${file.id || 'file'}-${file.size_bytes}"`;
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const variant = request.nextUrl.searchParams.get('variant') === 'thumbnail' ? 'thumbnail' : '';
    let file = await getPublicCmsFile(id, variant);
    if (!file) file = await getAdminCmsFile(id, variant).catch(() => null);
    if (!file) return new Response('Filen finnes ikke.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const etag = file.is_public ? publicEtag(file) : null;
    if (etag && request.headers.get('if-none-match')?.split(',').map((value) => value.trim()).includes(etag)) {
      return new Response(null, { status: 304, headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60, must-revalidate',
      } });
    }
    const object = await downloadCmsObject(file.storage_key);
    if (!object.Body) throw new Error('Missing object body');
    const bytes = await object.Body.transformToByteArray();
    return new Response(bytes, {
      headers: {
        'Content-Type': file.mime_type,
        'Content-Length': String(file.size_bytes),
        'Content-Disposition': contentDisposition(variant ? `${file.original_filename}.webp` : file.original_filename, request.nextUrl.searchParams.get('download') === '1'),
        'Cache-Control': file.is_public ? 'public, max-age=300, s-maxage=300, stale-while-revalidate=60, must-revalidate' : 'private, no-store',
        ...(etag ? { ETag: etag } : {}),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('CMS file download failed', { code: error.code || error.cause?.code, message: error.message });
    return new Response('Filen er midlertidig utilgjengelig.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

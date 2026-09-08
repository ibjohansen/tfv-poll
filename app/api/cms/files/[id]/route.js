import { downloadCmsObject } from '@/lib/cms-storage';
import { getAdminCmsFile, getPublicCmsFile } from '@/lib/cms-files';

export const runtime = 'nodejs';

function contentDisposition(filename, download) {
  const fallback = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'fil';
  return `${download ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    let file = await getPublicCmsFile(id);
    if (!file) file = await getAdminCmsFile(id).catch(() => null);
    if (!file) return new Response('Filen finnes ikke.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const object = await downloadCmsObject(file.storage_key);
    if (!object.Body) throw new Error('Missing object body');
    const bytes = await object.Body.transformToByteArray();
    return new Response(bytes, {
      headers: {
        'Content-Type': file.mime_type,
        'Content-Length': String(file.size_bytes),
        'Content-Disposition': contentDisposition(file.original_filename, request.nextUrl.searchParams.get('download') === '1'),
        'Cache-Control': file.is_public ? 'public, max-age=300' : 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('CMS file download failed', { code: error.code || error.cause?.code, message: error.message });
    return new Response('Filen er midlertidig utilgjengelig.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

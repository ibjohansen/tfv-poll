import { cookies } from 'next/headers';
import { downloadCmsObject } from '@/lib/cms-storage';
import { getSurveyAccess, surveySessionCookieName } from '@/lib/membership';
import { getAdminSurveyAttachment, getMemberSurveyAttachment } from '@/lib/survey-files';

export const runtime = 'nodejs';

function contentDisposition(filename, download) {
  const fallback = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'fil';
  return `${download ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const secret = (await cookies()).get(surveySessionCookieName())?.value;
    let file = null;
    if (secret) {
      const access = await getSurveyAccess(secret);
      if (access.survey?.id) file = await getMemberSurveyAttachment(id, access.survey.id);
    }
    if (!file) file = await getAdminSurveyAttachment(id).catch(() => null);
    if (!file) return new Response('Filen finnes ikke.', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
    const object = await downloadCmsObject(file.storage_key);
    if (!object.Body) throw new Error('Missing object body');
    const bytes = await object.Body.transformToByteArray();
    return new Response(bytes, { headers: {
      'Content-Type': file.mime_type,
      'Content-Length': String(file.size_bytes),
      'Content-Disposition': contentDisposition(file.original_filename, request.nextUrl.searchParams.get('download') === '1'),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    console.error('Survey attachment download failed', { code: error.code || error.cause?.code, message: error.message });
    return new Response('Filen er midlertidig utilgjengelig.', { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}

import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { reorderAdminCmsAttachments, uploadAdminCmsFile } from '@/lib/cms-files';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: 'Ugyldig forespørsel.' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 21 * 1024 * 1024) return response({ ok: false, message: 'Filen er for stor.' }, 413);
  try {
    const form = await request.formData();
    const attachment = await uploadAdminCmsFile((await params).id, form.get('file'), 'attachment');
    return response({ ok: true, attachment }, 201);
  } catch (error) {
    console.error('CMS attachment upload failed', { code: error.code || error.cause?.code, message: error.message });
    if (error.message === 'Unauthorized') return response({ ok: false, message: 'Innlogging kreves.' }, 401);
    if (error.message === 'CMS storage is not configured') return response({ ok: false, message: 'Fillagring er ikke konfigurert. Kjør Neon-oppsettet først.' }, 503);
    if (error.message === 'Too many attachments') return response({ ok: false, message: 'En side kan ha maksimalt 20 vedlegg.' }, 409);
    return response({ ok: false, message: 'Filtypen støttes ikke, eller filen er større enn 20 MB.' }, apiErrorStatus(error, 400));
  }
}

export async function PATCH(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: 'Ugyldig forespørsel.' }, 403);
  try {
    const { ids } = await readJsonObject(request);
    await reorderAdminCmsAttachments((await params).id, ids);
    return response({ ok: true });
  } catch (error) {
    const status = apiErrorStatus(error);
    return response({ ok: false, message: 'Kunne ikke endre rekkefølgen på vedleggene.' }, status);
  }
}

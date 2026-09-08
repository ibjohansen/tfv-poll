import { NextResponse } from 'next/server';
import { deleteAdminCmsFile, uploadAdminCmsFile } from '@/lib/cms-files';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
function uploadError(error) {
  if (error.message === 'Unauthorized') return response({ ok: false, message: 'Innlogging kreves.' }, 401);
  if (error.message === 'Page not found') return response({ ok: false, message: 'Lagre siden før du laster opp et bilde.' }, 404);
  if (error.message === 'CMS storage is not configured') return response({ ok: false, message: 'Fillagring er ikke konfigurert. Kjør Neon-oppsettet først.' }, 503);
  return response({ ok: false, message: 'Bildet må være JPG, PNG eller WebP og maksimalt 10 MB.' }, 400);
}

export async function POST(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: 'Ugyldig forespørsel.' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 11 * 1024 * 1024) return response({ ok: false, message: 'Bildet er for stort.' }, 413);
  try {
    const form = await request.formData();
    const image = await uploadAdminCmsFile((await params).id, form.get('file'), 'image');
    return response({ ok: true, image }, 201);
  } catch (error) {
    console.error('CMS image upload failed', { code: error.code || error.cause?.code, message: error.message });
    return uploadError(error);
  }
}

export async function DELETE(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: 'Ugyldig forespørsel.' }, 403);
  try {
    const { imageId } = await request.json();
    await deleteAdminCmsFile((await params).id, imageId, 'image');
    return response({ ok: true });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : error.message === 'File not found' ? 404 : 400;
    return response({ ok: false, message: status === 404 ? 'Bildet finnes ikke lenger.' : 'Kunne ikke fjerne bildet.' }, status);
  }
}

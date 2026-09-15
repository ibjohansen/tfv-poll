import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { deleteAdminCmsPage, getAdminCmsPage, updateAdminCmsPage } from '@/lib/cms-pages';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
function statusFor(error) {
  if (error.message === 'Unauthorized') return 401;
  if (error.message === 'Page not found') return 404;
  if ((error.code || error.cause?.code) === '23505') return 409;
  return apiErrorStatus(error, 400);
}

function messageFor(error) {
  if (error.message === 'Unauthorized') return 'Innlogging kreves.';
  if (error.message === 'Page not found') return 'Siden finnes ikke lenger.';
  if ((error.code || error.cause?.code) === '23505') return 'URL-en er allerede i bruk. Velg en annen URL.';
  return 'Kontroller tittel, URL, kategori og tekstlengder.';
}

export async function GET(_request, { params }) {
  try {
    const page = await getAdminCmsPage((await params).id);
    return page ? response({ ok: true, page }) : response({ ok: false, message: 'Siden finnes ikke.' }, 404);
  } catch (error) {
    return response({ ok: false, message: messageFor(error) }, statusFor(error));
  }
}

export async function PATCH(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: 'Ugyldig forespørsel.' }, 403);
  try {
    return response({ ok: true, page: await updateAdminCmsPage((await params).id, await readJsonObject(request)) });
  } catch (error) {
    console.error('CMS page update failed', { id: (await params).id, code: error.code || error.cause?.code, message: error.message });
    return response({ ok: false, message: messageFor(error) }, statusFor(error));
  }
}

export async function DELETE(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: 'Ugyldig forespørsel.' }, 403);
  try {
    await deleteAdminCmsPage((await params).id);
    return response({ ok: true });
  } catch (error) {
    console.error('CMS page delete failed', { id: (await params).id, code: error.code || error.cause?.code, message: error.message });
    return response({ ok: false, message: messageFor(error) }, statusFor(error));
  }
}

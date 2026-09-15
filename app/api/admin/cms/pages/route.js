import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { createAdminCmsPage, getAdminCmsPages } from '@/lib/cms-pages';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
function errorResponse(error) {
  const code = error.code || error.cause?.code;
  if (error.message === 'Unauthorized') return response({ ok: false, message: 'Innlogging kreves.' }, 401);
  if (code === '23505') return response({ ok: false, message: 'URL-en er allerede i bruk. Velg en annen URL.' }, 409);
  if (error.message === 'Mock data cannot be changed') return response({ ok: false, message: 'CMS-et kan ikke endres i mock-modus.' }, 409);
  return response({ ok: false, message: 'Kontroller tittel, URL, kategori og tekstlengder.' }, apiErrorStatus(error, 400));
}

export async function GET(request) {
  try {
    const pages = await getAdminCmsPages(request.nextUrl.searchParams.get('search') || '');
    return response({ ok: true, pages });
  } catch (error) {
    console.error('CMS page list failed', { code: error.code || error.cause?.code, message: error.message });
    return errorResponse(error);
  }
}

export async function POST(request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: 'Ugyldig forespørsel.' }, 403);
  try {
    return response({ ok: true, page: await createAdminCmsPage(await readJsonObject(request)) }, 201);
  } catch (error) {
    console.error('CMS page create failed', { code: error.code || error.cause?.code, message: error.message });
    return errorResponse(error);
  }
}

import { NextResponse } from 'next/server';
import { deleteAdminCmsFile, updateAdminCmsAttachment } from '@/lib/cms-files';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function PATCH(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: 'Ugyldig forespørsel.' }, 403);
  try {
    const route = await params;
    const { title } = await request.json();
    return response({ ok: true, attachment: await updateAdminCmsAttachment(route.id, route.attachmentId, title) });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : error.message === 'Attachment not found' ? 404 : 400;
    return response({ ok: false, message: status === 404 ? 'Vedlegget finnes ikke lenger.' : 'Skriv inn et visningsnavn på maksimalt 200 tegn.' }, status);
  }
}

export async function DELETE(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: 'Ugyldig forespørsel.' }, 403);
  try {
    const route = await params;
    await deleteAdminCmsFile(route.id, route.attachmentId);
    return response({ ok: true });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : error.message === 'File not found' ? 404 : 400;
    return response({ ok: false, message: status === 404 ? 'Vedlegget finnes ikke lenger.' : 'Kunne ikke fjerne vedlegget.' }, status);
  }
}

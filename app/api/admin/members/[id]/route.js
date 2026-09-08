import { NextResponse } from 'next/server';
import { deleteAdminMember, updateAdminMember } from '@/lib/admin-member-updates';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    const member = await updateAdminMember((await params).id, await request.json());
    return NextResponse.json({ ok: true, member }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : error.message === 'Member not found' ? 404 : error.code === '23505' ? 409 : 400;
    console.error('Admin member update failed', { id: (await params).id, code: error.code || error.cause?.code, message: error.message });
    const message = status === 409 ? 'H-nummeret er allerede i bruk.'
      : error.message === 'Mock data cannot be changed' ? 'Mock-data kan ikke endres.'
        : error.message === 'H-nummer is required' ? 'H-nummer må fylles ut.'
          : error.message === 'Invalid member' ? 'Kontroller at feltene har gyldige verdier.'
            : 'Kunne ikke lagre medlemmet.';
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(_request, { params }) {
  try { await deleteAdminMember((await params).id); return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    const id = (await params).id;
    const code = error.code || error.cause?.code;
    console.error('Admin member delete failed', { id, code, message: error.message });
    const status = error.message === 'Unauthorized' ? 401 : error.message === 'Member not found' ? 404 : 400;
    const message = code === '42703'
      ? 'Databasen mangler oppdatert skjema. Kjør npm run db:setup og prøv igjen.'
      : error.message === 'Member not found'
        ? 'Medlemmet finnes ikke lenger.'
        : 'Kunne ikke slette medlemmet.';
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

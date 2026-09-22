import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { deleteAdminMember, setAdminMemberAnnualFee, updateAdminMember } from '@/lib/admin-member-updates';
import { getAdminMemberById } from '@/lib/admin-members';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminMembers');
  try {
    const member = await getAdminMemberById((await params).id);
    if (!member) throw new Error('Member not found');
    return NextResponse.json({ ok: true, member }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error);
    return NextResponse.json({ ok: false, message: t(status === 404 ? 'missing' : 'fetch') },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function PATCH(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminMembers');
  try {
    const input = await readJsonObject(request);
    if (input.action === 'set_annual_fee') {
      const annualFee = await setAdminMemberAnnualFee((await params).id, input);
      return NextResponse.json({ ok: true, annualFee }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const member = await updateAdminMember((await params).id, input);
    return NextResponse.json({ ok: true, member }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error);
    console.error('Admin member update failed', { id: (await params).id, code: error.code || error.cause?.code, message: error.message });
    const message = status === 409 ? t('duplicate')
      : error.message === 'Mock data cannot be changed' ? t('mock')
        : error.message === 'H-nummer is required' ? t('hRequired')
          : error.message === 'Invalid member' ? t('invalid')
            : error.message === 'Invalid annual fee' ? t('annualFee') : t('save');
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminMembers');
  try { await deleteAdminMember((await params).id); return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    const id = (await params).id;
    const code = error.code || error.cause?.code;
    console.error('Admin member delete failed', { id, code, message: error.message });
    const status = apiErrorStatus(error);
    const message = code === '42703'
      ? t('schema')
      : error.message === 'Member not found'
        ? t('missing')
        : t('delete');
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { getAdminMembers } from '@/lib/admin-members';
import { createAdminMember } from '@/lib/admin-member-updates';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function GET(request) {
  const { t } = getRequestI18n(request, 'backend.adminMembers');
  const { searchParams } = request.nextUrl;
  const search = (searchParams.get('q') || '').trim().slice(0, 200);
  const page = /^\d{1,6}$/.test(searchParams.get('page') || '') ? Math.max(1, Number(searchParams.get('page'))) : 1;
  const sort = searchParams.get('sort') || 'h_number';
  const direction = searchParams.get('dir') === 'desc' ? 'desc' : 'asc';
  const incompleteContact = searchParams.get('contact') === 'incomplete';
  const hasComment = searchParams.get('comment') === 'present';
  try {
    const data = await getAdminMembers(search, page, sort, direction, incompleteContact, hasComment, { membershipStatus: searchParams.get('membership') || '', hamletId: searchParams.get('hamlet') || '', groupId: searchParams.get('group') || '', turufjellAsSharing: searchParams.get('sharing') || '' });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error);
    return NextResponse.json({ message: t('load') }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend.adminMembers');
  try { return NextResponse.json({ ok: true, member: await createAdminMember(await readJsonObject(request)) }, { status: 201, headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return NextResponse.json({ ok: false, message: t(error.message === 'H-nummer is required' ? 'hRequired' : 'check') }, { status: apiErrorStatus(error), headers: { 'Cache-Control': 'no-store' } }); }
}

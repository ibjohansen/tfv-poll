import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { getAdminMembers } from '@/lib/admin-members';
import { createAdminMember } from '@/lib/admin-member-updates';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = request.nextUrl;
  const search = (searchParams.get('q') || '').trim().slice(0, 200);
  const page = /^\d{1,6}$/.test(searchParams.get('page') || '') ? Math.max(1, Number(searchParams.get('page'))) : 1;
  const sort = searchParams.get('sort') || 'h_number';
  const direction = searchParams.get('dir') === 'desc' ? 'desc' : 'asc';
  const incompleteContact = searchParams.get('contact') === 'incomplete';
  const hasComment = searchParams.get('comment') === 'present';
  try {
    const data = await getAdminMembers(search, page, sort, direction, incompleteContact, hasComment, { membershipStatus: searchParams.get('membership') || '', hamletId: searchParams.get('hamlet') || '', groupId: searchParams.get('group') || '' });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error);
    return NextResponse.json({ message: 'Kunne ikke hente flere medlemmer.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request) {
  try { return NextResponse.json({ ok: true, member: await createAdminMember(await readJsonObject(request)) }, { status: 201, headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return NextResponse.json({ ok: false, message: error.message === 'H-nummer is required' ? 'H-nummer må fylles ut.' : 'Kontroller medlemsopplysningene.' }, { status: apiErrorStatus(error), headers: { 'Cache-Control': 'no-store' } }); }
}

import { getMemberGroups, changeMemberGroup } from '@/lib/member-groups';
import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store, private' };
export async function GET(request) {
  const { t } = getRequestI18n(request, 'backend.adminGroups');
  try { return Response.json({ groups: await getMemberGroups() }, { headers }); }
  catch (error) { return Response.json({ message: t('load') }, { status: apiErrorStatus(error), headers }); }
}
export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend');
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return Response.json({ message: t('api.invalidRequest') }, { status: 403, headers });
  try { return Response.json({ ok: true, group: await changeMemberGroup(await readJsonObject(request)) }, { headers }); }
  catch (error) { return Response.json({ message: t('adminGroups.save') }, { status: apiErrorStatus(error), headers }); }
}

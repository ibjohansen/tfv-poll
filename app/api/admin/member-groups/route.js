import { getMemberGroups, changeMemberGroup } from '@/lib/member-groups';
import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store, private' };
export async function GET() {
  try { return Response.json({ groups: await getMemberGroups() }, { headers }); }
  catch (error) { return Response.json({ message: 'Kunne ikke hente gruppene.' }, { status: apiErrorStatus(error), headers }); }
}
export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return Response.json({ message: 'Ugyldig forespørsel.' }, { status: 403, headers });
  try { return Response.json({ ok: true, group: await changeMemberGroup(await readJsonObject(request)) }, { headers }); }
  catch (error) { return Response.json({ message: 'Kunne ikke lagre gruppen. Kontroller navn og utvalg, og prøv igjen.' }, { status: apiErrorStatus(error), headers }); }
}

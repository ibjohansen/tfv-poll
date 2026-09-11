import { cookies } from 'next/headers';
import { getMemberSelfServiceProfile } from '@/lib/member-self-service';
import { MEMBER_SESSION_COOKIE } from '@/lib/member-self-service-utils';

export const runtime = 'nodejs';

export async function GET() {
  const secret = (await cookies()).get(MEMBER_SESSION_COOKIE)?.value;
  const profile = await getMemberSelfServiceProfile(secret);
  if (!profile) return Response.json({ message: 'Tilgangen er ugyldig eller utløpt.' }, { status: 401, headers: { 'Cache-Control': 'no-store, private' } });
  const body = JSON.stringify({ exported_at: new Date().toISOString(), ...profile }, null, 2);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mine-medlemsopplysninger.json"',
      'Cache-Control': 'no-store, private',
    },
  });
}

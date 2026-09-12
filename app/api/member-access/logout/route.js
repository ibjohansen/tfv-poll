import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { revokeMemberSession } from '@/lib/member-self-service';
import { memberSessionCookieName } from '@/lib/member-self-service-utils';

export const runtime = 'nodejs';

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ ok: false }, { status: 403 });
  const cookieName = memberSessionCookieName();
  const secret = (await cookies()).get(cookieName)?.value;
  try { await revokeMemberSession(secret); } catch {}
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store, private' } });
  response.cookies.set(cookieName, '', {
    maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

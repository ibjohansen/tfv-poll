import { NextResponse } from 'next/server';
import { verifyMemberAccess } from '@/lib/member-self-service';
import { memberCookieOptions, memberSessionCookieName } from '@/lib/member-self-service-utils';

export const runtime = 'nodejs';

export async function GET(request) {
  const session = await verifyMemberAccess(request.nextUrl.searchParams.get('token'));
  const destination = new URL('/mine-opplysninger', request.nextUrl.origin);
  if (!session) destination.searchParams.set('status', 'invalid');
  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'no-store, private');
  const cookieName = memberSessionCookieName();
  if (session) response.cookies.set(cookieName, session.secret, memberCookieOptions(session.expires_at));
  else response.cookies.set(cookieName, '', {
    maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

import { NextResponse } from 'next/server';
import { verifyMemberAccess } from '@/lib/member-self-service';
import { MEMBER_SESSION_COOKIE, memberCookieOptions } from '@/lib/member-self-service-utils';

export const runtime = 'nodejs';

export async function GET(request) {
  const session = await verifyMemberAccess(request.nextUrl.searchParams.get('token'));
  const destination = new URL('/mine-opplysninger', request.nextUrl.origin);
  if (!session) destination.searchParams.set('status', 'invalid');
  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'no-store, private');
  if (session) response.cookies.set(MEMBER_SESSION_COOKIE, request.nextUrl.searchParams.get('token'), memberCookieOptions(session.expires_at));
  else response.cookies.set(MEMBER_SESSION_COOKIE, '', { maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax' });
  return response;
}

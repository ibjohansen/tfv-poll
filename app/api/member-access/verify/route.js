import { NextResponse } from 'next/server';
import { verifyMemberAccess } from '@/lib/member-self-service';
import { memberCookieOptions, memberSessionCookieName } from '@/lib/member-self-service-utils';
import { getApplicationOrigin } from '@/lib/request-origin';

export const runtime = 'nodejs';

export async function GET(request) {
  let session = null;
  try { session = await verifyMemberAccess(request.nextUrl.searchParams.get('token')); }
  catch (error) {
    console.error('Member access verification failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
  }
  const destination = new URL('/mine-opplysninger', getApplicationOrigin(request));
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

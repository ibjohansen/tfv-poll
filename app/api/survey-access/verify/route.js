import { NextResponse } from 'next/server';
import { exchangeSurveyAccessToken, surveySessionCookieName, surveySessionCookieOptions } from '@/lib/membership';
import { getApplicationOrigin } from '@/lib/request-origin';

export const runtime = 'nodejs';

export async function GET(request) {
  const destination = new URL('/survey', getApplicationOrigin(request));
  let session = null;
  try { session = await exchangeSurveyAccessToken(request.nextUrl.searchParams.get('token')); }
  catch (error) {
    console.error('Survey access verification failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
  }
  if (!session) destination.searchParams.set('status', 'invalid');
  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'no-store, private');
  const cookieName = surveySessionCookieName();
  if (session) response.cookies.set(cookieName, session.secret, surveySessionCookieOptions(session.expires_at));
  else response.cookies.set(cookieName, '', {
    maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

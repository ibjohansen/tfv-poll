import { NextResponse } from 'next/server';
import { verifyMembershipRequest } from '@/lib/member-self-service';

export const runtime = 'nodejs';

export async function GET(request) {
  let verified = false;
  try { verified = await verifyMembershipRequest(request.nextUrl.searchParams.get('token')); }
  catch (error) {
    console.error('Membership verification failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
  }
  const destination = new URL('/', request.nextUrl.origin);
  destination.searchParams.set('membership', verified ? 'verified' : 'invalid');
  destination.hash = 'medlemsopplysninger';
  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'no-store, private');
  return response;
}

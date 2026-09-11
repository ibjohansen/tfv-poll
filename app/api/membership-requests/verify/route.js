import { NextResponse } from 'next/server';
import { verifyMembershipRequest } from '@/lib/member-self-service';

export const runtime = 'nodejs';

export async function GET(request) {
  const verified = await verifyMembershipRequest(request.nextUrl.searchParams.get('token'));
  const destination = new URL('/', request.nextUrl.origin);
  destination.searchParams.set('membership', verified ? 'verified' : 'invalid');
  destination.hash = 'medlemsopplysninger';
  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'no-store, private');
  return response;
}

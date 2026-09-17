import { NextResponse } from 'next/server';
import { verifyMemberEmailChange } from '@/lib/member-self-service';
import { getApplicationOrigin } from '@/lib/request-origin';

export const runtime = 'nodejs';

export async function GET(request) {
  const destination = new URL('/mine-opplysninger', getApplicationOrigin(request));
  try {
    const result = await verifyMemberEmailChange(request.nextUrl.searchParams.get('token'));
    destination.searchParams.set('emailChange', result?.stage || 'invalid');
  } catch (error) {
    console.error('Member email verification failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
    destination.searchParams.set('emailChange', 'invalid');
  }
  return NextResponse.redirect(destination, { status: 303, headers: { 'Cache-Control': 'no-store, private' } });
}

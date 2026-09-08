import { NextResponse } from 'next/server';
import { auth } from './auth';
import { isAllowedAdmin, isAuthConfigured } from './lib/admin-policy';
import { isPublicPath } from './lib/route-access';

export async function proxy(request) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();
  const session = isAuthConfigured() ? await auth() : null;
  if (isAllowedAdmin(session?.user)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ message: 'Innlogging kreves.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.redirect(new URL('/admin/login', request.url));
}

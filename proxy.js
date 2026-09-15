import { NextResponse } from 'next/server';
import { auth } from './auth';
import { adminPermissions, isAllowedAdmin, isAuthConfigured } from './lib/admin-policy';
import { isPublicPath } from './lib/route-access';

function permissionForPath(pathname) {
  if (pathname.startsWith('/api/admin/member-groups') || pathname.startsWith('/api/admin/newsletters')) return 'members';
  if (pathname.startsWith('/admin/map') || pathname.startsWith('/api/admin/map')) return 'members';
  if (pathname.startsWith('/admin/audit')) return 'audit';
  if (pathname.startsWith('/admin/members/matrikkel') || pathname.startsWith('/api/admin/matrikkel')) return 'matrikkel';
  if (pathname.startsWith('/admin/members') || pathname.startsWith('/admin/inbox') || pathname.startsWith('/api/admin/members') || pathname.startsWith('/api/admin/member-requests')) return 'members';
  if (pathname.startsWith('/admin/surveys') || pathname.startsWith('/api/admin/surveys')) return 'surveys';
  if (pathname.startsWith('/admin/web') || pathname.startsWith('/api/admin/cms')) return 'cms';
  return 'read';
}

function contentSecurityPolicy(nonce) {
  const development = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
  const upgrade = process.env.NODE_ENV === 'production' ? '; upgrade-insecure-requests' : '';
  return `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://norgeskart.no https://www.norgeskart.no; form-action 'self'; img-src 'self' data: blob: https://cache.kartverket.no; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development}; connect-src 'self' https://ws.geonorge.no${upgrade}`;
}

function nextWithCsp(request, nonce, csp) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

function responseWithCsp(response, csp) {
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export async function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce);
  if (isPublicPath(request.nextUrl.pathname)) return nextWithCsp(request, nonce, csp);
  const session = isAuthConfigured() ? await auth() : null;
  if (isAllowedAdmin(session?.user)) {
    const permission = permissionForPath(request.nextUrl.pathname);
    if (adminPermissions(session.user).has(permission)) return nextWithCsp(request, nonce, csp);
    if (request.nextUrl.pathname.startsWith('/api/')) {
      console.warn('Security event', { event: 'admin_access_denied', result: 'forbidden', area: permission, occurredAt: new Date().toISOString() });
      return responseWithCsp(NextResponse.json({ message: 'Du har ikke tilgang.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }), csp);
    }
    return responseWithCsp(NextResponse.redirect(new URL('/admin', request.url)), csp);
  }
  if (request.nextUrl.pathname.startsWith('/api/')) {
    console.warn('Security event', { event: 'admin_access_denied', result: 'unauthorized', area: permissionForPath(request.nextUrl.pathname), occurredAt: new Date().toISOString() });
    return responseWithCsp(NextResponse.json({ message: 'Innlogging kreves.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }), csp);
  }
  return responseWithCsp(NextResponse.redirect(new URL('/admin/login', request.url)), csp);
}

export const config = {
  // Disse eksakte maskin-til-maskin-rutene autentiseres med jobbhemmeligheten i
  // funksjonen, ikke med nettlesercookie. Ikke åpne hele /.netlify/functions/.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|\\.netlify/functions/(?:matrikkel-sync-background|survey-email-background|newsletter-background)/?$).*)'],
};

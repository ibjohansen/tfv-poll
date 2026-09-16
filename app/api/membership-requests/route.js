import { NextResponse } from 'next/server';
import { createMembershipRequest } from '@/lib/member-self-service';
import { isMemberAccessRateLimited } from '@/lib/rate-limit';
import { getSql } from '@/lib/db';
import { consumeMemberAccessLimits, getPublicBrowserMarker, PUBLIC_BROWSER_COOKIE } from '@/lib/shared-rate-limit';
import { apiErrorStatus } from '@/lib/api-errors';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';
const SERVER_TIMEOUT_MS = 20_000;

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend');
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  if (isMemberAccessRateLimited(request)) return NextResponse.json({ ok: false, message: t('members.attempts') }, { status: 429 });
  const startedAt = Date.now();
  let stage = 'request_body';
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(SERVER_TIMEOUT_MS)]);
  const setStage = (nextStage) => {
    stage = nextStage;
    console.info('Membership request progress', { stage, elapsedMs: Date.now() - startedAt });
  };
  try {
    const input = await request.json();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 400 });
    const marker = getPublicBrowserMarker(request);
    const identifier = input.primary_contact_email || input.h_number || input.street_address;
    setStage('rate_limit');
    const limited = await consumeMemberAccessLimits({
      request, identifier, browserMarker: marker.value, sql: getSql(), scopePrefix: 'membership-request',
    });
    if (limited) return NextResponse.json({ ok: false, message: t('members.attempts') }, { status: 429 });
    const result = await createMembershipRequest(input, { signal, onStage: setStage });
    console.info('Membership request completed', {
      outcome: result?.outcome || 'accepted', elapsedMs: Date.now() - startedAt,
    });
    const response = NextResponse.json({
      ok: true,
      message: t('members.membershipAccepted'),
    }, { status: 202, headers: { 'Cache-Control': 'no-store, private' } });
    if (marker.created) response.cookies.set(PUBLIC_BROWSER_COOKIE, marker.value, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    console.error('Membership request failed', {
      code: error.code || error.cause?.code, name: error.name, stage,
      elapsedMs: Date.now() - startedAt, occurredAt: new Date().toISOString(),
    });
    const status = apiErrorStatus(error);
    const message = status === 504 ? t('members.timeout')
      : status >= 500 ? t('members.unavailable') : t('members.checkFields');
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
  }
}

import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { createSurveyEmailCampaign, getSurveyEmailOverview, sendSurveyTestEmail } from '@/lib/survey-email';
import { isEmailRateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

function errorResponse(error) {
  const status = apiErrorStatus(error, 403);
  const messages = {
    DISABLED: 'E-postsending er deaktivert.',
    CONFIGURATION: 'MailerSend er ikke ferdig konfigurert.',
    BULK_DISABLED: 'Masseutsendelse er deaktivert inntil videre.',
    SUPPRESSION_PERMISSION: 'MailerSend-tokenet mangler «Suppressions: Read only». Opprett et nytt token og start serveren på nytt.',
    SUPPRESSED: 'Testmottakeren er undertrykt og kan ikke motta e-post.',
  };
  if (status >= 500) console.error('Survey email operation failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
  return NextResponse.json({ ok: false, message: messages[error.code] || (status === 403 ? 'Du har ikke tilgang til e-postutsendelse.' : status === 404 ? 'Undersøkelsen finnes ikke.' : status === 409 ? 'Undersøkelsen kan ikke sendes ut.' : 'E-posthandlingen kunne ikke fullføres.') }, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

export async function GET(request, { params }) {
  try {
    const overview = await getSurveyEmailOverview((await params).id, request.nextUrl.searchParams.get('page'));
    return NextResponse.json({ ok: true, overview }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request, { params }) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  if (isEmailRateLimited(request)) return NextResponse.json({ ok: false, message: 'For mange e-posthandlinger. Vent ett minutt.' }, { status: 429 });
  const surveyId = (await params).id;
  try {
    const input = await readJsonObject(request);
    if (input.action === 'test') {
      const delivery = await sendSurveyTestEmail(surveyId, input.recipient);
      return NextResponse.json({ ok: true, delivery }, { headers: { 'Cache-Control': 'no-store, private' } });
    }
    if (!['send', 'resend'].includes(input.action)) return NextResponse.json({ ok: false, message: 'Ugyldig e-posthandling.' }, { status: 400 });
    const result = await createSurveyEmailCampaign(surveyId, { replaceCompleted: input.action === 'resend' });
    let backgroundStarted = false;
    if (process.env.MAILERSEND_JOB_SECRET && process.env.NODE_ENV === 'production') {
      try {
        const response = await fetch(new URL('/.netlify/functions/survey-email-background', request.nextUrl.origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-MailerSend-Job-Secret': process.env.MAILERSEND_JOB_SECRET },
          body: JSON.stringify({ campaignId: result.campaign.id }),
        });
        backgroundStarted = response.status === 202 || response.ok;
      } catch (error) {
        console.error('Survey email background start failed', { campaignId: result.campaign.id, code: error.code, occurredAt: new Date().toISOString() });
      }
    }
    return NextResponse.json({ ok: true, ...result, backgroundStarted }, { status: result.existing ? 200 : 201, headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) { return errorResponse(error); }
}

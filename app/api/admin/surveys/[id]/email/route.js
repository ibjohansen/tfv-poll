import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { createSurveyEmailCampaign, failPendingSurveyEmailCampaign, getSurveyEmailOverview, sendSurveyTestEmail } from '@/lib/survey-email';
import { dispatchSurveyEmailCampaign } from '@/lib/survey-email-background';
import { isEmailRateLimited } from '@/lib/rate-limit';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

function errorResponse(error, t) {
  const status = apiErrorStatus(error, 403);
  const messages = {
    DISABLED: t('emailDisabled'),
    CONFIGURATION: t('emailConfiguration'),
    BULK_DISABLED: t('bulkDisabled'),
    SUPPRESSION_PERMISSION: t('emailPermission'),
    SUPPRESSED: t('suppressed'),
  };
  if (status >= 500) console.error('Survey email operation failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
  return NextResponse.json({ ok: false, message: messages[error.code] || t(status === 403 ? 'emailForbidden' : status === 404 ? 'missingShort' : status === 409 ? 'cannotSend' : 'emailAction') }, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

export async function GET(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminSurveys');
  try {
    const overview = await getSurveyEmailOverview((await params).id, request.nextUrl.searchParams.get('page'));
    return NextResponse.json({ ok: true, overview }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) { return errorResponse(error, t); }
}

export async function POST(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  if (isEmailRateLimited(request)) return NextResponse.json({ ok: false, message: t('adminSurveys.emailRate') }, { status: 429 });
  const surveyId = (await params).id;
  try {
    const input = await readJsonObject(request);
    if (input.action === 'test') {
      const delivery = await sendSurveyTestEmail(surveyId, input.recipient);
      return NextResponse.json({ ok: true, delivery }, { headers: { 'Cache-Control': 'no-store, private' } });
    }
    if (!['send', 'resend'].includes(input.action)) return NextResponse.json({ ok: false, message: t('adminSurveys.invalidEmailAction') }, { status: 400 });
    const result = await createSurveyEmailCampaign(surveyId, { replaceCompleted: input.action === 'resend' });
    let backgroundStarted = false;
    if (process.env.NODE_ENV === 'production' && ['pending', 'running', 'failed'].includes(result.campaign.status)) {
      try {
        await dispatchSurveyEmailCampaign(result.campaign.id, request.nextUrl.origin);
        backgroundStarted = true;
      } catch (error) {
        console.error('Survey email background start failed', { campaignId: result.campaign.id, code: error.code, occurredAt: new Date().toISOString() });
        const campaign = await failPendingSurveyEmailCampaign(result.campaign.id);
        if (campaign?.status !== 'running' && campaign?.status !== 'completed') {
          return NextResponse.json({ ok: false, ...result, campaign: campaign || result.campaign, backgroundStarted: false,
            message: t('adminSurveys.emailStart') },
          { status: 503, headers: { 'Cache-Control': 'no-store, private' } });
        }
        backgroundStarted = true;
      }
    }
    return NextResponse.json({ ok: true, ...result, backgroundStarted }, { status: result.existing ? 200 : 201, headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) { return errorResponse(error, (key) => t(`adminSurveys.${key}`)); }
}

import { cookies } from 'next/headers';
import { after, NextResponse } from 'next/server';
import { isMockMode } from '@/lib/mock-store';
import {
  getMockSurveyAccess, getSurveyAccess, submitMockSurveyResponse,
  submitSurveyResponse, surveySessionCookieName,
} from '@/lib/membership';
import { isRateLimited } from '@/lib/rate-limit';
import { getRequestI18n } from '@/lib/i18n/request';
import { hasValidSurveyAnswers } from '@/lib/survey-questions';
import { dispatchSurveyReceipts, isSurveyEmailBackgroundConfigured } from '@/lib/survey-email-background';
import { getApplicationOrigin } from '@/lib/request-origin';

export const runtime = 'nodejs';

function reply(body, status) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function hasValidOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

function accessErrorStatus(status) {
  if (status === 'answered') return 409;
  if (status === 'ended') return 410;
  return 403;
}

export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend');
  if (!hasValidOrigin(request)) return reply({ ok: false, message: t('api.invalidRequest') }, 403);
  if (isRateLimited(request)) return reply({ ok: false, message: t('api.tooManyRequests') }, 429);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ ok: false, message: t('api.invalidRequest') }, 400);

  try {
    const secret = (await cookies()).get(surveySessionCookieName())?.value;
    const access = isMockMode()
      ? await getMockSurveyAccess(body.mockToken, body.mockSurveyId)
      : await getSurveyAccess(secret);
    if (access.status !== 'ready') {
      return reply({ ok: false, message: access.message }, accessErrorStatus(access.status));
    }
    if (body.website) return reply({ ok: true }, 200);
    if (!Number.isSafeInteger(body.questionVersion) || body.questionVersion < 1 || body.questionVersion > 2147483647) {
      return reply({ ok: false, message: t('survey.reload') }, 400);
    }
    if (body.questionVersion !== access.survey.question_version) {
      return reply({ ok: false, code: 'SURVEY_CHANGED', message: t('survey.changed') }, 409);
    }
    if (!hasValidSurveyAnswers(body.answers, access.survey.questions)) {
      return reply({ ok: false, message: t('survey.allRequired') }, 400);
    }
    const result = isMockMode()
      ? await submitMockSurveyResponse(body.mockToken, body.mockSurveyId, body.answers)
      : await submitSurveyResponse(secret, body.answers, { questionVersion: body.questionVersion });
    if (!result.saved) return reply({ ok: false, code: 'SURVEY_CONFLICT', message: t('survey.conflict') }, 409);
    if (result.receiptId && isSurveyEmailBackgroundConfigured()) {
      const origin = getApplicationOrigin(request);
      after(async () => {
        try { await dispatchSurveyReceipts(origin); }
        catch { console.error('Survey receipt dispatch failed; receipt remains queued'); }
      });
    }
    const response = reply({ ok: true, accepted: result.accepted !== false }, 201);
    if (!isMockMode()) response.cookies.set(surveySessionCookieName(), '', {
      maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    });
    return response;
  } catch {
    return reply({ ok: false, message: t('survey.saveFailed') }, 500);
  }
}

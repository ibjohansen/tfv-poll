import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/mock-store';
import {
  getMockSurveyAccess, getSurveyAccess, submitMockSurveyResponse,
  submitSurveyResponse, surveySessionCookieName,
} from '@/lib/membership';
import { isRateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const allowedAnswers = new Set(['ja', 'nei', 'usikker']);

function reply(body, status) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function hasValidOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

function hasValidAnswers(answers, questions) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return false;
  const ids = questions.map(({ id }) => id);
  return Object.keys(answers).length === ids.length && ids.every((id) => allowedAnswers.has(answers[id]));
}

function accessErrorStatus(status) {
  if (status === 'answered') return 409;
  if (status === 'ended') return 410;
  return 403;
}

export async function POST(request) {
  if (!hasValidOrigin(request)) return reply({ ok: false, message: 'Ugyldig forespørsel.' }, 403);
  if (isRateLimited(request)) return reply({ ok: false, message: 'For mange forespørsler. Prøv igjen om litt.' }, 429);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ ok: false, message: 'Ugyldig forespørsel.' }, 400);

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
      return reply({ ok: false, message: 'Last inn undersøkelsen på nytt før du sender inn svaret.' }, 400);
    }
    if (body.questionVersion !== access.survey.question_version) {
      return reply({ ok: false, code: 'SURVEY_CHANGED', message: 'Spørsmålene er endret siden du åpnet skjemaet. Last inn undersøkelsen på nytt og svar på de oppdaterte spørsmålene.' }, 409);
    }
    if (!hasValidAnswers(body.answers, access.survey.questions)) {
      return reply({ ok: false, message: 'Alle spørsmål må besvares.' }, 400);
    }
    const result = isMockMode()
      ? await submitMockSurveyResponse(body.mockToken, body.mockSurveyId, body.answers)
      : await submitSurveyResponse(secret, body.answers, { questionVersion: body.questionVersion });
    if (!result.saved) return reply({ ok: false, code: 'SURVEY_CONFLICT', message: 'Svaret ble ikke lagret. Undersøkelsen eller tilgangen kan ha endret seg, eller tomten har allerede svart. Last inn undersøkelsen på nytt.' }, 409);
    const response = reply({ ok: true }, 201);
    if (!isMockMode()) response.cookies.set(surveySessionCookieName(), '', {
      maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    });
    return response;
  } catch {
    return reply({ ok: false, message: 'Vi klarte ikke å lagre svaret ditt. Prøv igjen om litt.' }, 500);
  }
}

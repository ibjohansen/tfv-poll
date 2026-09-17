import { NextResponse } from 'next/server';
import { apiErrorStatus } from '@/lib/api-errors';
import { getRequestI18n } from '@/lib/i18n/request';
import { isSameOriginRequest } from '@/lib/request-origin';
import { uploadAdminSurveyAttachment } from '@/lib/survey-files';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminSurveys');
  if (!isSameOriginRequest(request)) return response({ ok: false, message: t('invalidRequest') }, 403);
  if (Number(request.headers.get('content-length') || 0) > 21 * 1024 * 1024) {
    return response({ ok: false, message: t('fileTooLarge') }, 413);
  }
  try {
    const form = await request.formData();
    const attachment = await uploadAdminSurveyAttachment((await params).id, form.get('file'));
    return response({ ok: true, attachment }, 201);
  } catch (error) {
    console.error('Survey attachment upload failed', { code: error.code || error.cause?.code, message: error.message });
    const messages = {
      'CMS storage is not configured': 'storage',
      'Too many survey attachments': 'tooManyAttachments',
      'Mock data cannot be changed': 'mock',
      'Survey not found': 'missingShort',
    };
    return response({ ok: false, message: t(messages[error.message] || 'unsupportedFile') }, apiErrorStatus(error, 400));
  }
}

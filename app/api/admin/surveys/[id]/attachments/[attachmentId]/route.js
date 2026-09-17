import { NextResponse } from 'next/server';
import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { getRequestI18n } from '@/lib/i18n/request';
import { isSameOriginRequest } from '@/lib/request-origin';
import { deleteAdminSurveyAttachment, updateAdminSurveyAttachment } from '@/lib/survey-files';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminSurveys');
  if (!isSameOriginRequest(request)) return response({ ok: false, message: t('invalidRequest') }, 403);
  try {
    const route = await params;
    const { title } = await readJsonObject(request);
    const attachment = await updateAdminSurveyAttachment(route.id, route.attachmentId, title);
    return response({ ok: true, attachment });
  } catch (error) {
    const status = apiErrorStatus(error);
    return response({ ok: false, message: t(status === 404 ? 'attachmentMissing' : 'attachmentName') }, status);
  }
}

export async function DELETE(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminSurveys');
  if (!isSameOriginRequest(request)) return response({ ok: false, message: t('invalidRequest') }, 403);
  try {
    const route = await params;
    await deleteAdminSurveyAttachment(route.id, route.attachmentId);
    return response({ ok: true });
  } catch (error) {
    const status = apiErrorStatus(error);
    return response({ ok: false, message: t(status === 404 ? 'attachmentMissing' : 'removeAttachment') }, status);
  }
}

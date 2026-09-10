import { parseMailerSendEvent, processMailerSendEvent, verifyMailerSendSignature, MAILERSEND_TEST_SIGNING_SECRET } from '@/lib/mailersend-webhook';

export const runtime = 'nodejs';

const MAX_BODY_SIZE = 256 * 1024;

export async function POST(request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE) return new Response(null, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_SIZE) return new Response(null, { status: 413 });
  let payload;
  try { payload = JSON.parse(rawBody); } catch { return new Response(null, { status: 400 }); }
  const signature = request.headers.get('signature');
  const signingSecret = payload?.type === 'webhook.test' ? MAILERSEND_TEST_SIGNING_SECRET : process.env.MAILERSEND_WEBHOOK_SIGNING_SECRET;
  if (!verifyMailerSendSignature(rawBody, signature, signingSecret)) return new Response(null, { status: 401 });
  if (payload.type === 'webhook.test') return new Response(null, { status: 204 });
  if (!parseMailerSendEvent(payload)) return new Response(null, { status: 204 });
  try {
    const result = await processMailerSendEvent(payload);
    console.info('MailerSend webhook processed', { eventType: payload.type, outcome: result.outcome, occurredAt: new Date().toISOString() });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('MailerSend webhook failed', { eventType: payload.type, code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
    return new Response(null, { status: 500 });
  }
}

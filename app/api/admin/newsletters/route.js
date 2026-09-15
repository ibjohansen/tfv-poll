import { getNewsletters, saveNewsletter, previewNewsletter, queueNewsletter, failPendingNewsletter, sendNewsletterTest } from '@/lib/newsletters';
import { dispatchNewsletter } from '@/lib/newsletter-background';
import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { isEmailRateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store, private' };
export async function GET(request) {
  try { return Response.json(await getNewsletters(request.nextUrl.searchParams.get('id')), { headers }); }
  catch (error) { return Response.json({ message: 'Kunne ikke hente nyhetsbrevene.' }, { status: apiErrorStatus(error), headers }); }
}
export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return Response.json({ message: 'Ugyldig forespørsel.' }, { status: 403, headers });
  try {
    const input = await readJsonObject(request);
    if (input.action === 'save') return Response.json({ ok: true, campaign: await saveNewsletter(input) }, { headers });
    if (input.action === 'preview') return Response.json({ ok: true, ...await previewNewsletter(input.id) }, { headers });
    if (!['test', 'send'].includes(input.action)) throw new Error('Invalid newsletter');
    if (isEmailRateLimited(request)) return Response.json({ message: 'For mange forespørsler. Vent litt og prøv igjen.' }, { status: 429, headers });
    if (input.action === 'test') return Response.json({ ok: true, ...await sendNewsletterTest(input.id, input.recipient) }, { headers });
    const campaign = await queueNewsletter(input.id);
    if (campaign.status !== 'completed') {
      try { await dispatchNewsletter(campaign.id, request.nextUrl.origin); }
      catch { return Response.json({ ok: false, campaign: await failPendingNewsletter(campaign.id), message: 'Kunne ikke bekrefte oppstart. Kontroller konfigurasjonen før du prøver igjen.' }, { status: 503, headers }); }
    }
    return Response.json({ ok: true, campaign }, { headers });
  } catch (error) {
    const status = apiErrorStatus(error);
    return Response.json({ message: status === 409 ? 'Ingen mottakere er valgt, eller kampanjen kan ikke endres.' : status >= 500 ? 'E-posttjenesten er midlertidig utilgjengelig.' : 'Kontroller innhold, grupper og tilgang.' }, { status, headers });
  }
}

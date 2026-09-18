import { recoverDueSurveyEmailCampaigns, recoverStalledMatrikkelRuns, startDueMonthlyMatrikkelRun } from '../../lib/background-watchdog.js';
import { getSql } from '../../lib/db.js';
import { dispatchSurveyReceipts } from '../../lib/survey-email-background.js';

// Netlify scheduled functions cannot be invoked through their public URL.
// Preview/manual test invocations additionally fail closed on environment.
export default async function handler(request, context) {
  if (context?.deploy?.context !== 'production' || process.env.APP_ENVIRONMENT !== 'production') return;
  let failed = false;
  try {
    const sql = getSql();
    const [receipts] = await sql`SELECT EXISTS (SELECT 1 FROM survey_response_receipts WHERE status = 'pending'
      OR (status = 'processing' AND processing_at < NOW() - INTERVAL '16 minutes')) AS pending`;
    if (receipts?.pending) await dispatchSurveyReceipts(process.env.URL);
  } catch {
    failed = true;
    console.error('Survey receipt watchdog failed', { occurredAt: new Date().toISOString() });
  }
  try {
    const result = await recoverDueSurveyEmailCampaigns(process.env.URL);
    if (result.result !== 'idle') console.info('Survey email watchdog', result);
  } catch {
    console.error('Survey email watchdog failed', { occurredAt: new Date().toISOString() });
    failed = true;
  }
  try {
    const result = await startDueMonthlyMatrikkelRun(process.env.URL);
    if (!['idle', 'not_configured'].includes(result.result)) console.info('Monthly Matrikkel watchdog', result);
  } catch {
    console.error('Monthly Matrikkel watchdog failed', { occurredAt: new Date().toISOString() });
    failed = true;
  }
  try {
    const result = await recoverStalledMatrikkelRuns(process.env.URL);
    if (result.result !== 'idle') console.info('Matrikkel watchdog', result);
  } catch {
    console.error('Matrikkel watchdog failed', { occurredAt: new Date().toISOString() });
    failed = true;
  }
  if (failed) throw new Error('Background watchdog failed');
}

export const config = { schedule: '*/5 * * * *' };

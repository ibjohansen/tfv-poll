import { recoverDueSurveyEmailCampaigns, recoverStalledMatrikkelRuns, startDueMonthlyMatrikkelRun } from '../../lib/background-watchdog.js';
import { getSql } from '../../lib/db.js';
import { dispatchSurveyReceipts } from '../../lib/survey-email-background.js';
import { startDueMonthlyActivityImport } from '../../lib/activity-map-import-background.js';
import { dispatchTaskNotifications } from '../../lib/task-notifications-background.js';
import { dispatchAnnualDues } from '../../lib/annual-dues-background.js';

// Netlify scheduled functions cannot be invoked through their public URL.
// Preview/manual test invocations additionally fail closed on environment.
export default async function handler(request, context) {
  if (context?.deploy?.context !== 'production' || process.env.APP_ENVIRONMENT !== 'production') return;
  let failed = false;
  if (process.env.INVOICE_EMAIL_ENABLED === 'true') {
    try {
      const sql = getSql();
      const [invoices] = await sql`SELECT EXISTS (SELECT 1 FROM email_deliveries WHERE email_type = 'annual_dues'
        AND ((status = 'pending' AND (invoice_retry_at IS NULL OR invoice_retry_at <= NOW()))
          OR (status = 'processing' AND processing_at < NOW() - INTERVAL '16 minutes'))) AS pending`;
      if (invoices?.pending) await dispatchAnnualDues(process.env.URL);
    } catch {
      failed = true;
      console.error('Annual dues watchdog failed', { occurredAt: new Date().toISOString() });
    }
  }
  try {
    const sql = getSql();
    const [tasks] = await sql`SELECT EXISTS (SELECT 1 FROM email_deliveries WHERE email_type = 'admin_task_notification'
      AND ((status = 'pending' AND (task_retry_at IS NULL OR task_retry_at <= NOW()))
        OR (status = 'processing' AND processing_at < NOW() - INTERVAL '16 minutes'))) AS pending`;
    if (tasks?.pending) await dispatchTaskNotifications(process.env.URL);
  } catch {
    failed = true;
    console.error('Task notification watchdog failed', { occurredAt: new Date().toISOString() });
  }
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
    const result = await startDueMonthlyActivityImport(process.env.URL);
    if (!['idle', 'not_configured'].includes(result.result)) console.info('Monthly activity map import watchdog', result);
  } catch {
    console.error('Monthly activity map import watchdog failed', { occurredAt: new Date().toISOString() });
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

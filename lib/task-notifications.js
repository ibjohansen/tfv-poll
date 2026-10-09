import { getSql } from './db.js';
import { assertDatabaseEnvironment } from './security-config.js';
import { isMailerSendConfigured, sendEmail, getMailerSendSuppressions, isSuppressedRecipient } from './mailer-service.js';
import { trustedJobOrigin } from './request-origin.js';
import { renderTaskNotificationEmail } from './task-notification-email.js';

async function sourceExists(sql, task) {
  // Fixed table names: never interpolate a table name from stored JSON into SQL.
  let rows;
  if (task?.source_table === 'member_requests') rows = await sql`SELECT id FROM member_requests WHERE id = ${task.source_id}`;
  else if (task?.source_table === 'member_profile_updates') rows = await sql`SELECT id FROM member_profile_updates WHERE id = ${task.source_id}`;
  else if (task?.source_table === 'matrikkel_sync_runs') rows = await sql`SELECT id FROM matrikkel_sync_runs WHERE id = ${task.source_id} AND deleted_at IS NULL`;
  else if (task?.source_table === 'activity_map_source_runs') rows = await sql`SELECT id FROM activity_map_source_runs WHERE id = ${task.source_id}`;
  return Boolean(rows?.length);
}

export async function processTaskNotifications(options = {}) {
  const env = options.env || process.env;
  if (!isMailerSendConfigured(env)) return { disabled: true };
  const baseUrl = trustedJobOrigin(env.AUTH_URL, env);
  const sql = options.sql || getSql();
  await assertDatabaseEnvironment(sql, env);
  // A timed-out provider request may have been accepted. Preserve it for manual
  // investigation instead of risking a second notification.
  await sql`UPDATE email_deliveries SET status = 'failed', failure_reason = 'UNCERTAIN_AFTER_INTERRUPTION', failed_at = NOW()
    WHERE email_type = 'admin_task_notification' AND status = 'processing'
      AND processing_at < NOW() - INTERVAL '16 minutes'`;
  const suppressions = await (options.getSuppressions || getMailerSendSuppressions)({ env, sql });
  const send = options.sendEmail || sendEmail;
  let sent = 0;
  const deadline = Date.now() + 12 * 60_000;
  for (let i = 0; i < (options.batchSize || 100) && Date.now() + 35_000 < deadline; i++) {
    const [delivery] = await sql`UPDATE email_deliveries SET status = 'processing', processing_at = NOW(), task_attempt_count = task_attempt_count + 1
      WHERE id = (SELECT id FROM email_deliveries WHERE email_type = 'admin_task_notification' AND status = 'pending'
        AND (task_retry_at IS NULL OR task_retry_at <= NOW()) ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
      AND status = 'pending' RETURNING id, task_snapshot, task_attempt_count`;
    if (!delivery) break;
    const task = delivery.task_snapshot;
    if (!await sourceExists(sql, task)) {
      await sql`UPDATE email_deliveries SET status = 'failed', failure_reason = 'TASK_REMOVED_BEFORE_SEND', failed_at = NOW() WHERE id = ${delivery.id}`;
      continue;
    }
    const [blocked] = await sql`SELECT recipient_email FROM email_suppressions WHERE recipient_email = 'post@turufjellvel.no'`;
    if (blocked || isSuppressedRecipient('post@turufjellvel.no', suppressions)) {
      await sql`UPDATE email_deliveries SET status = 'suppressed', failure_reason = 'RECIPIENT_SUPPRESSED', failed_at = NOW() WHERE id = ${delivery.id}`;
      continue;
    }
    try {
      const rendered = renderTaskNotificationEmail(task, baseUrl);
      await sql`UPDATE email_deliveries SET subject = ${rendered.subject} WHERE id = ${delivery.id}`;
      const { messageId } = await send({ to: 'post@turufjellvel.no', ...rendered, tags: ['admin-task'],
        context: { emailType: 'admin_task_notification', deliveryId: delivery.id, recipient: 'post@turufjellvel.no' } }, { env, sql });
      await sql`UPDATE email_deliveries SET status = 'sent', provider_message_id = ${messageId}, sent_at = NOW(),
        failure_reason = NULL, task_retry_at = NULL WHERE id = ${delivery.id}`;
      sent++;
    } catch (error) {
      // Only a definite rate-limit rejection is safe to retry automatically.
      const retry = error.providerStatus === 429 && delivery.task_attempt_count < 5;
      const parsedRetry = Date.parse(error.retryAt);
      const retryAt = retry ? new Date(Math.max(Date.now() + 60_000,
        Number.isFinite(parsedRetry) ? parsedRetry : 0)).toISOString() : null;
      await sql`UPDATE email_deliveries SET status = ${retry ? 'pending' : error.code === 'SUPPRESSED' ? 'suppressed' : 'failed'},
        failure_reason = ${String(error.code || 'SEND_FAILED').slice(0, 100)}, task_retry_at = ${retryAt},
        failed_at = CASE WHEN ${retry} THEN NULL ELSE NOW() END WHERE id = ${delivery.id}`;
      if (retry) break;
    }
    if (options.delayMs !== 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs || 6100));
  }
  const [remaining] = await sql`SELECT EXISTS (SELECT 1 FROM email_deliveries WHERE email_type = 'admin_task_notification'
    AND status = 'pending' AND (task_retry_at IS NULL OR task_retry_at <= NOW())) AS pending`;
  return { sent, pending: Boolean(remaining?.pending) };
}

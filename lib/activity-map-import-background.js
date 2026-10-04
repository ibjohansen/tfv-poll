import { timingSafeEqual } from 'node:crypto';
import { createActivityImportPreviewCore } from './activity-map-import/core.js';
import { getSql } from './db.js';
import { trustedJobOrigin } from './request-origin.js';

const FUNCTION_PATH = '/.netlify/functions/activity-map-import-background';
const DISPATCH_TIMEOUT_MS = 10_000;
const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-01$/;

function jobSecret(env) {
  const secret = env.ACTIVITY_MAP_JOB_SECRET;
  return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

function dispatchError(code, status) {
  return Object.assign(new Error('JOB_START_FAILED'), { code, status, messageCode: 'JOB_START_FAILED' });
}

export async function dispatchScheduledActivityImport(scheduledMonth, origin, options = {}) {
  const env = options.env || process.env;
  const secret = jobSecret(env);
  if (!secret) throw dispatchError('JOB_NOT_CONFIGURED');
  if (!MONTH_PATTERN.test(scheduledMonth || '')) throw dispatchError('INVALID_SCHEDULED_MONTH');
  let url;
  try {
    url = new URL(FUNCTION_PATH, trustedJobOrigin(origin, env));
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
  } catch { throw dispatchError('INVALID_JOB_ORIGIN'); }
  let response;
  try {
    response = await (options.fetchImpl || fetch)(url, {
      method: 'POST', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', 'X-Activity-Map-Job-Secret': secret },
      body: JSON.stringify({ scheduledMonth }),
    });
  } catch { throw dispatchError('JOB_DISPATCH_UNAVAILABLE'); }
  if (response.status !== 202 || response.redirected) throw dispatchError('JOB_DISPATCH_REJECTED', response.status);
}

export async function startDueMonthlyActivityImport(origin, options = {}) {
  const env = options.env || process.env;
  if (!jobSecret(env)) return { result: 'not_configured' };
  const requestedAt = options.now === undefined ? null : new Date(options.now);
  if (requestedAt && !Number.isFinite(requestedAt.getTime())) throw new Error('Invalid scheduler time');
  const sql = options.sql || getSql();
  const [due] = await sql.query(`WITH clock AS (
      SELECT timezone('Europe/Oslo', COALESCE($1::timestamptz, NOW())) AS local_now
    ) SELECT date_trunc('month', local_now)::date::text AS scheduled_month FROM clock
    WHERE EXTRACT(DAY FROM local_now) = 1
      AND NOT EXISTS (
        SELECT 1 FROM activity_map_source_runs r
        WHERE r.run_type = 'monthly' AND r.scheduled_month = date_trunc('month', clock.local_now)::date
          AND NOT (r.status = 'fetching' AND r.created_at < NOW() - INTERVAL '20 minutes')
      )`, [requestedAt?.toISOString() || null]);
  if (!due) return { result: 'idle' };
  try {
    await (options.dispatch || dispatchScheduledActivityImport)(due.scheduled_month, origin, { env, fetchImpl: options.fetchImpl });
    return { result: 'accepted', scheduledMonth: due.scheduled_month };
  } catch {
    return { result: 'dispatch_failed', scheduledMonth: due.scheduled_month };
  }
}

export async function runScheduledActivityImport(scheduledMonth, options = {}) {
  if (!MONTH_PATTERN.test(scheduledMonth || '')) throw dispatchError('INVALID_SCHEDULED_MONTH');
  return createActivityImportPreviewCore({ action: 'preview', sourceIds: ['kartverket', 'openstreetmap'] }, {
    sql: options.sql || getSql(), actor: 'system:monthly-activity-map', runType: 'monthly', scheduledMonth,
    fetchImpl: options.fetchImpl, sourceFetcher: options.sourceFetcher, signal: options.signal,
    idGenerator: options.idGenerator,
  });
}

export function validActivityMapJobSecret(received, env = process.env) {
  const expected = jobSecret(env);
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

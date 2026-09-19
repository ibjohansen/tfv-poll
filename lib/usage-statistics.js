import 'server-only';
import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { normalizeUsageBatch, normalizeUsageEvent, normalizeUsagePeriod } from './usage-metrics.js';

export async function recordUsagePageView(input) {
  const value = normalizeUsageEvent(input);
  return recordUsageBatch({ events: [value], webVitals: [] });
}

export async function recordUsageBatch(input) {
  const value = normalizeUsageBatch(input);
  if (isMockMode()) return;
  await getSql().query(`WITH clock AS (
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Oslo')::date AS today
  ), page_events AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS event(page_type text, device_category text)
  ), page_aggregate AS (
    SELECT page_type, device_category, COUNT(*)::bigint AS views FROM page_events GROUP BY page_type, device_category
  ), inserted_pages AS (
    INSERT INTO usage_daily_stats (day, page_type, device_category, views, updated_at)
    SELECT today, page_type, device_category, views, CURRENT_TIMESTAMP FROM clock CROSS JOIN page_aggregate
    ON CONFLICT (day, page_type, device_category) DO UPDATE
    SET views = usage_daily_stats.views + EXCLUDED.views, updated_at = CURRENT_TIMESTAMP
    RETURNING 1
  ), vital_events AS (
    SELECT * FROM jsonb_to_recordset($2::jsonb) AS event(metric_name text, value double precision, rating text, device_category text)
  ), vital_aggregate AS (
    SELECT metric_name, rating, device_category, COUNT(*)::bigint AS samples, SUM(value) AS value_sum
    FROM vital_events GROUP BY metric_name, rating, device_category
  ), inserted_vitals AS (
    INSERT INTO usage_web_vitals_daily (day, metric_name, rating, device_category, samples, value_sum, updated_at)
    SELECT today, metric_name, rating, device_category, samples, value_sum, CURRENT_TIMESTAMP FROM clock CROSS JOIN vital_aggregate
    ON CONFLICT (day, metric_name, rating, device_category) DO UPDATE
    SET samples = usage_web_vitals_daily.samples + EXCLUDED.samples,
      value_sum = usage_web_vitals_daily.value_sum + EXCLUDED.value_sum,
      updated_at = CURRENT_TIMESTAMP
    RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM inserted_pages)::int AS page_groups,
    (SELECT COUNT(*) FROM inserted_vitals)::int AS vital_groups`, [
    JSON.stringify(value.events.map(({ pageType, deviceCategory }) => ({ page_type: pageType, device_category: deviceCategory }))),
    JSON.stringify(value.webVitals.map(({ name, value: metricValue, rating, deviceCategory }) => ({ metric_name: name, value: metricValue, rating, device_category: deviceCategory }))),
  ]);
}

function emptyStatistics(period, granularity) {
  return { period, granularity, from: null, to: null, total: 0, trend: [], pages: [], devices: [] };
}

export async function getUsageStatistics(input = {}) {
  await requirePermission('audit');
  const period = normalizeUsagePeriod(input.days);
  const days = period === 'all' ? null : period;
  const granularity = period === 'all' ? 'month' : period > 90 ? 'week' : 'day';
  if (isMockMode()) return emptyStatistics(period, granularity);
  const rows = await getSql().query(`WITH clock AS (
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Oslo')::date AS today
  ), coverage AS (
    SELECT MIN(day) AS first_day FROM usage_daily_stats
  ), bounds AS (
    SELECT today AS to_day,
      CASE WHEN $1::int IS NULL THEN COALESCE(first_day, today) ELSE today - ($1::int - 1) END AS from_day
    FROM clock CROSS JOIN coverage
  ), selected AS (
    SELECT day, page_type, device_category, views
    FROM usage_daily_stats, bounds WHERE day BETWEEN from_day AND to_day
  ), trend_values AS (
    SELECT date_trunc($2::text, day::timestamp) AS bucket, SUM(views)::bigint AS views
    FROM selected GROUP BY bucket
  ), buckets AS (
    SELECT generate_series(
      date_trunc($2::text, from_day::timestamp),
      date_trunc($2::text, to_day::timestamp),
      CASE $2::text WHEN 'day' THEN INTERVAL '1 day' WHEN 'week' THEN INTERVAL '1 week' ELSE INTERVAL '1 month' END
    ) AS bucket FROM bounds
  )
  SELECT 'bounds' AS kind, from_day::text AS label, to_day::text AS secondary, 0::bigint AS views FROM bounds
  UNION ALL SELECT 'total', 'total', NULL, COALESCE(SUM(views), 0)::bigint FROM selected
  UNION ALL SELECT 'trend', buckets.bucket::date::text, NULL, COALESCE(trend_values.views, 0)::bigint
    FROM buckets LEFT JOIN trend_values USING (bucket)
  UNION ALL SELECT 'page', page_type, NULL, SUM(views)::bigint FROM selected GROUP BY page_type
  UNION ALL SELECT 'device', device_category, NULL, SUM(views)::bigint FROM selected GROUP BY device_category`, [days, granularity]);
  const result = emptyStatistics(period, granularity);
  for (const row of rows) {
    const views = Number(row.views) || 0;
    if (row.kind === 'bounds') { result.from = row.label; result.to = row.secondary; }
    else if (row.kind === 'total') result.total = views;
    else if (row.kind === 'trend') result.trend.push({ date: row.label, views });
    else if (row.kind === 'page') result.pages.push({ pageType: row.label, views });
    else if (row.kind === 'device') result.devices.push({ deviceCategory: row.label, views });
  }
  result.trend.sort((a, b) => a.date.localeCompare(b.date));
  result.pages.sort((a, b) => b.views - a.views || a.pageType.localeCompare(b.pageType));
  result.devices.sort((a, b) => b.views - a.views || a.deviceCategory.localeCompare(b.deviceCategory));
  return result;
}

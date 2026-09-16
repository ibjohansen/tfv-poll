import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule, plain } from '../helpers/load-module.mjs';
import * as metrics from '../../lib/usage-metrics.js';

const db = createTestDatabase();
let usage;

before(async () => {
  await db.migrate();
  await db.migrate();
  usage = await loadModule('lib/usage-statistics.js', {
    './admin-access.js': { requirePermission: async (permission) => assert.equal(permission, 'audit') },
    './db.js': { getSql: () => db.sql },
    './mock-store.js': { isMockMode: () => false },
    './usage-metrics.js': metrics,
  });
});
beforeEach(async () => { await db.sql`DELETE FROM usage_daily_stats`; });
after(async () => db.close());

test('concurrent pageviews are atomically aggregated and available to administrators', async () => {
  await Promise.all(Array.from({ length: 12 }, () => usage.recordUsagePageView({ pageType: 'home', deviceCategory: 'mobile' })));
  await usage.recordUsagePageView({ pageType: 'article', deviceCategory: 'desktop' });
  const result = await usage.getUsageStatistics({ days: 7 });
  assert.equal(result.total, 13);
  assert.deepEqual(plain(result.pages), [{ pageType: 'home', views: 12 }, { pageType: 'article', views: 1 }]);
  assert.deepEqual(plain(result.devices), [{ deviceCategory: 'mobile', views: 12 }, { deviceCategory: 'desktop', views: 1 }]);
  assert.equal(result.trend.length, 7);
  assert.equal(result.trend.reduce((sum, row) => sum + row.views, 0), 13);
});

test('historical anonymous aggregates are retained and available in the all-time view', async () => {
  await db.sql`INSERT INTO usage_daily_stats (day, page_type, device_category, views)
    VALUES (((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Oslo')::date - INTERVAL '5 years')::date, 'home', 'desktop', 4)`;
  await usage.recordUsagePageView({ pageType: 'survey', deviceCategory: 'tablet' });
  const [{ count }] = await db.sql`SELECT COUNT(*)::int AS count FROM usage_daily_stats`;
  assert.equal(count, 2);
  const result = await usage.getUsageStatistics({ days: 'all' });
  assert.equal(result.total, 5);
  assert.equal(result.granularity, 'month');
  assert.equal(result.trend.reduce((sum, row) => sum + row.views, 0), 5);
});

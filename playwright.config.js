import { defineConfig, devices } from '@playwright/test';
import { testOrigin } from './tests/e2e/environment.mjs';

export default defineConfig({
  testDir: './tests/e2e', testMatch: '**/*.spec.js', fullyParallel: false,
  timeout: 45_000, expect: { timeout: 10_000 }, workers: 1,
  forbidOnly: Boolean(process.env.CI), retries: process.env.CI ? 1 : 0,
  reporter: 'list', use: { baseURL: testOrigin, trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'node tests/e2e/server.mjs', url: `${testOrigin}/admin/login`, reuseExistingServer: false, timeout: 120_000 },
});

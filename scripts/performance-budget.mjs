import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { encode } from 'next-auth/jwt';

const port = 4320;
const origin = `http://127.0.0.1:${port}`;
const secret = 'isolated-performance-test-secret-not-production';
const tenant = '00000000-0000-0000-0000-000000000001';
const admin = 'performance-test@turufjellvel.no';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', MOCK_DATA: 'true',
    APP_ENVIRONMENT: 'development', TOKEN_AUDIENCE: 'isolated-performance-tests',
    AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: 'true',
    AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: tenant,
    AUTH_MICROSOFT_ENTRA_ID_ID: 'synthetic-client', AUTH_MICROSOFT_ENTRA_ID_SECRET: 'synthetic-secret',
    ADMIN_EMAILS: admin, ADMIN_REQUIRED_ROLES: 'TFV.MemberAdmin,TFV.CmsEditor,TFV.SecurityAudit',
    DATABASE_URL: '', DATABASE_URL_UNPOOLED: '', MAILERSEND_ENABLED: 'false', MAILERSEND_BULK_ENABLED: 'false',
  },
});
let serverOutput = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-4000); });

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { await fetch(`${origin}/`); return; } catch {}
    if (server.exitCode !== null) throw new Error(`Performance test server exited early:\n${serverOutput}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Performance test server did not become ready:\n${serverOutput}`);
}

async function measure(page, path) {
  let requests = 0;
  let kartverketRequests = 0;
  let failedResponses = 0;
  const cspMessages = [];
  const javaScriptBodies = [];
  const onRequest = (request) => {
    const url = new URL(request.url());
    if (url.origin === origin) requests += 1;
    if (url.hostname === 'cache.kartverket.no') kartverketRequests += 1;
  };
  const onResponse = (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() >= 400) failedResponses += 1;
    if (url.origin === origin && url.pathname.endsWith('.js')) {
      javaScriptBodies.push(response.body().then((body) => body.byteLength).catch(() => 0));
    }
  };
  const onConsole = (message) => {
    if (/content security policy|violates the following/i.test(message.text())) cspMessages.push(message.text());
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('console', onConsole);
  const documentResponse = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const clientJavaScript = performance.getEntriesByType('resource')
      .filter((entry) => new URL(entry.name).pathname.endsWith('.js'))
      .reduce((total, entry) => total + (entry.transferSize || entry.encodedBodySize || entry.decodedBodySize || 0), 0);
    return { ttfb: navigation.responseStart, lcp: window.__tfvLcp || 0, clientJavaScript };
  });
  page.off('request', onRequest);
  page.off('response', onResponse);
  page.off('console', onConsole);
  const responseJavaScript = (await Promise.all(javaScriptBodies)).reduce((total, size) => total + size, 0);
  const documentJavaScript = await page.evaluate(async () => {
    const sources = [...new Set([...document.scripts].map((script) => script.src).filter(Boolean))];
    const sizes = await Promise.all(sources.map(async (source) => {
      try { return (await (await fetch(source)).arrayBuffer()).byteLength; } catch { return 0; }
    }));
    return sizes.reduce((total, size) => total + size, 0);
  });
  const csp = documentResponse?.headers()['content-security-policy'] || '';
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1] || '';
  const nonceMismatches = await page.evaluate((expectedNonce) => [...document.scripts]
    .filter((script) => script.src || script.textContent?.trim())
    .filter((script) => script.nonce !== expectedNonce).length, nonce);
  return {
    ...timing,
    clientJavaScript: Math.max(timing.clientJavaScript, responseJavaScript, documentJavaScript),
    requests,
    kartverketRequests,
    failedResponses,
    cspViolations: cspMessages.length,
    nonceMismatches: nonce ? nonceMismatches : 1,
  };
}

function enforce(label, result, budget) {
  for (const [metric, maximum] of Object.entries(budget)) {
    if (result[metric] > maximum) throw new Error(`${label} ${metric} ${Math.round(result[metric])} exceeds budget ${maximum}`);
  }
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const cookieName = 'authjs.session-token';
  await context.addCookies([{ name: cookieName, value: await encode({ secret, salt: cookieName, maxAge: 3600, token: { sub: 'synthetic-admin', email: admin, tenantId: tenant, roles: ['TFV.MemberAdmin', 'TFV.CmsEditor', 'TFV.SecurityAudit'] } }), url: origin, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__tfvLcp = 0;
    new PerformanceObserver((list) => {
      window.__tfvLcp = list.getEntries().at(-1)?.startTime || window.__tfvLcp;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const results = {};
  for (const [label, path] of [['home-cold', '/'], ['home-warm', '/'], ['members', '/admin/members'], ['web', '/admin/web'], ['web-editor', '/admin/web/new']]) results[label] = await measure(page, path);
  enforce('home-cold', results['home-cold'], { cspViolations: 0, nonceMismatches: 0 });
  enforce('home-warm', results['home-warm'], { ttfb: 500, lcp: 1500, clientJavaScript: 900_000, requests: 45, kartverketRequests: 0, failedResponses: 0, cspViolations: 0, nonceMismatches: 0 });
  enforce('members', results.members, { ttfb: 1500, clientJavaScript: 1_200_000, requests: 50, failedResponses: 0, cspViolations: 0, nonceMismatches: 0 });
  enforce('web', results.web, { ttfb: 1500, clientJavaScript: 900_000, requests: 45, failedResponses: 0, cspViolations: 0, nonceMismatches: 0 });
  enforce('web-editor', results['web-editor'], { ttfb: 1500, clientJavaScript: 1_400_000, requests: 50, failedResponses: 0, cspViolations: 0, nonceMismatches: 0 });
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

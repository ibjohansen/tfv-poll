import { test, expect } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import axe from 'axe-core';
import { testAdmin, testAuthSecret, testOrigin, testTenant } from './environment.mjs';
import { normalizeExpense, proposeAccountingYear } from '../../lib/accounting-validation.js';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => new URL(route.request().url()).origin === testOrigin ? route.continue() : route.abort());
});
async function authenticate(context, roles = ['TFV.MemberAdmin']) {
  const name = 'authjs.session-token';
  const value = await encode({ secret: testAuthSecret, salt: name, maxAge: 3600,
    token: { sub: 'synthetic-accountant', email: testAdmin, tenantId: testTenant, roles } });
  await context.addCookies([{ name, value, url: testOrigin, httpOnly: true, sameSite: 'Lax' }]);
}

test('accounting budget, reference totals, keyboard access and mobile layout', async ({ page, context }, testInfo) => {
  await authenticate(context); await page.goto('/admin/regnskap/browser-test');
  const dashboard = page.locator('.accounting-dashboard');
  await expect(dashboard.getByRole('heading', { name: 'Regnskap 2026' })).toBeVisible();
  await expect(dashboard.locator('.accounting-stat').first()).toContainText('102');
  await dashboard.getByRole('button', { name: 'Budsjett og inntekter', exact: true }).click();
  await expect(dashboard.getByLabel('Årskontingent (NOK)')).toHaveValue('250.00');
  await dashboard.getByRole('button', { name: 'Bruk 420 medlemmer fra registeret' }).click();
  await expect(dashboard.getByLabel('Forventet antall medlemmer')).toHaveValue('420');
  await expect(dashboard.getByText(/Forventet kontingent:/)).toContainText('105');
  await dashboard.getByLabel('Årskontingent (NOK)').focus();
  await expect(dashboard.getByLabel('Årskontingent (NOK)')).toBeFocused();
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async () => window.axe.run('.accounting-dashboard', { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] }));
  expect(result.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => node.target) }))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('accounting-budget.png'), fullPage: true });
});

test('supplier batch requires receipt review and preserves individual amounts and status dates', async ({ page, context }) => {
  await authenticate(context);
  const state = { year: 2026, years: [2026], settings: { ...proposeAccountingYear(2026, 411), version: 1 }, memberCount: 420, paidMemberCount: 400, expenses: [], attachments: [] };
  const operations = [];
  await page.route('**/api/admin/accounting/files', async (route) => {
    const number = state.attachments.length + 1;
    const file = { id: String(number).repeat(32), year: 2026, expense_id: null, original_filename: `synthetic-${number}.pdf`, url: `/api/admin/accounting/files/${String(number).repeat(32)}`,
      suggestion: { supplier: 'Synthetic supplier', amount: number === 1 ? '16.25' : '10.00', currency: 'USD', invoice_date: '2026-09-12', invoice_number: `SYN-${number}`, category: 'systems' } };
    state.attachments.push(file); await route.fulfill({ json: { ok: true, file } });
  });
  await page.route('**/api/admin/accounting?year=2026', (route) => route.fulfill({ json: { ok: true, data: state } }));
  await page.route('**/api/admin/accounting', async (route) => {
    const body = route.request().postDataJSON(); operations.push(body);
    if (body.operation === 'batch') {
      state.expenses = body.entries.map((entry) => ({ ...normalizeExpense(entry, 2026), version: 1 }));
      state.attachments.forEach((file) => { file.expense_id = state.expenses.find((expense) => expense.attachment_ids.includes(file.id)).id; });
    } else if (body.operation === 'status') {
      state.expenses.forEach((expense) => { expense[body.action === 'submit' ? 'submitted_on' : 'paid_on'] = body.date; expense.version++; });
    }
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/admin/regnskap/browser-test');
  const dashboard = page.locator('.accounting-dashboard');
  await dashboard.getByRole('button', { name: 'Kostnader og bilag', exact: true }).click();
  await dashboard.getByLabel('Last opp kvitteringer').setInputFiles([
    { name: 'one.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nSynthetic one') },
    { name: 'two.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nSynthetic two') },
  ]);
  await expect(dashboard.locator('.accounting-draft')).toHaveCount(2);
  await expect(dashboard.getByLabel('Leverandør', { exact: true })).toHaveValue('Synthetic supplier');
  // Apply only the rate to each row; original amounts must remain distinct.
  const drafts = dashboard.locator('.accounting-draft');
  await drafts.nth(0).getByLabel('Kurs: NOK per 1 valutaenhet').fill('10.123456');
  await drafts.nth(1).getByLabel('Kurs: NOK per 1 valutaenhet').fill('10.123456');
  await dashboard.getByRole('button', { name: 'Lagre 2 kostnader' }).click();
  expect(operations).toHaveLength(0);
  await drafts.nth(0).getByRole('checkbox').check(); await drafts.nth(1).getByRole('checkbox').check();
  await dashboard.getByRole('button', { name: 'Lagre 2 kostnader' }).click();
  await expect(drafts).toHaveCount(0);
  expect(operations[0].entries.map((entry) => entry.amount)).toEqual(['16.25', '10.00']);
  await dashboard.getByRole('checkbox', { name: 'Velg alle viste kostnader' }).check();
  await expect(dashboard.getByRole('button', { name: 'Merk som utbetalt' })).toBeDisabled();
  await dashboard.getByLabel('Dato for statusendring').fill('2026-09-20');
  await dashboard.getByRole('button', { name: 'Merk som levert' }).click();
  await expect(dashboard.getByText('Levert: 2026-09-20', { exact: true })).toHaveCount(2);
  await dashboard.getByRole('checkbox', { name: 'Velg alle viste kostnader' }).check();
  await dashboard.getByRole('button', { name: 'Merk som utbetalt' }).click();
  await expect(dashboard.getByText('Utbetalt: 2026-09-20', { exact: true })).toHaveCount(2);
});

test('read-only accounting hides mutation controls and receipt endpoints require authentication', async ({ page, context, request }) => {
  await authenticate(context, ['TFV.ReadOnly']); await page.goto('/admin/regnskap/browser-test');
  await page.getByRole('button', { name: 'Kostnader og bilag', exact: true }).click();
  await expect(page.getByLabel('Last opp kvitteringer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Budsjett og inntekter', exact: true }).click();
  await expect(page.getByLabel('Årskontingent (NOK)')).toBeDisabled();
  const response = await request.get('/api/admin/accounting/files/' + 'a'.repeat(32), { maxRedirects: 0 });
  expect([401, 403, 307]).toContain(response.status());
  expect(response.headers()['content-type'] || '').not.toContain('application/pdf');
});

test('annual meeting report prints without navigation or clipped columns', async ({ page, context }, testInfo) => {
  await authenticate(context);
  await page.goto('/admin/regnskap/arsmote?year=2027');
  await expect(page.locator('.accounting-report')).toBeVisible();
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.admin-sidebar')).toBeHidden();
  const layout = await page.locator('.accounting-report').evaluate((report) => {
    const table = report.querySelector('table');
    const cell = table.querySelector('td');
    return { width: report.getBoundingClientRect().width, tableWidth: table.getBoundingClientRect().width,
      pageWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
      cellPadding: parseFloat(getComputedStyle(cell).paddingTop) };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.pageWidth + 1);
  expect(layout.tableWidth).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.cellPadding).toBeLessThanOrEqual(8);
  await page.screenshot({ path: testInfo.outputPath('accounting-print.png'), fullPage: true });
});

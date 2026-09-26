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
    token: { sub: 'synthetic-accountant', name: 'Test Bruker', email: testAdmin, tenantId: testTenant, roles } });
  await context.addCookies([{ name, value, url: testOrigin, httpOnly: true, sameSite: 'Lax' }]);
}

test('accounting budget, reference totals, keyboard access and mobile layout', async ({ page, context }, testInfo) => {
  const hydrationErrors = [];
  page.on('console', (message) => { if (message.text().includes('Hydration failed')) hydrationErrors.push(message.text()); });
  page.on('pageerror', (error) => { if (error.message.includes('Hydration failed')) hydrationErrors.push(error.message); });
  await authenticate(context); await page.goto('/admin/regnskap/browser-test');
  const dashboard = page.locator('.accounting-dashboard');
  await expect(dashboard.getByRole('heading', { name: 'Økonomi 2026' })).toBeVisible();
  await expect(dashboard.locator('.accounting-stat').first()).toContainText('102');
  await expect(dashboard.getByRole('img', { name: /Inntekter og kostnader gjennom året/ })).toBeVisible();
  const chart = dashboard.locator('.accounting-chart');
  await expect(chart).toHaveAttribute('data-view', 'actual');
  await expect(chart.getByRole('button', { name: 'Regnskap' })).toHaveAttribute('aria-pressed', 'true');
  await chart.getByRole('button', { name: 'Budsjett' }).click();
  await expect(chart).toHaveAttribute('data-view', 'budget');
  await expect(chart.getByRole('button', { name: 'Budsjett' })).toHaveAttribute('aria-pressed', 'true');
  await expect(chart.getByText(/Årets budsjetterte kostnader er fordelt jevnt/)).toBeVisible();
  const balance = dashboard.getByRole('heading', { name: /Balanse per/ }).locator('..');
  await expect(balance.getByRole('heading', { name: 'Formue' })).toBeVisible();
  await expect(balance.getByRole('heading', { name: 'Gjeld og egenkapital' })).toBeVisible();
  await expect(balance.getByText('Sum formue').locator('..')).toContainText(/49.636,85/);
  await expect(balance.getByText('Sum gjeld og egenkapital').locator('..')).toContainText(/49.636,85/);
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
  expect(hydrationErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('accounting-budget.png'), fullPage: true });
});

test('uploaded receipt saves after choosing a currency and entering a comma-decimal rate', async ({ page, context }, testInfo) => {
  await authenticate(context);
  const state = { year: 2026, years: [2026], settings: { ...proposeAccountingYear(2026, 411), version: 1 }, memberCount: 420, invoicedMemberCount: 410, paidMemberCount: 400, collectionCandidateCount: 10, expenses: [], attachments: [] };
  const file = { id: 'a'.repeat(32), year: 2026, expense_id: null, original_filename: 'synthetic-receipt.pdf', url: `/api/admin/accounting/files/${'a'.repeat(32)}`,
    uploaded_by: 'Test Bruker',
    suggestion: { supplier: 'Synthetic supplier', amount: '', currency: '', invoice_date: '2026-09-12', category: 'systems' } };
  const operations = [];
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.route('**/api/admin/accounting/files', (route) => {
    state.attachments = [file];
    return route.fulfill({ status: 201, json: { ok: true, file } });
  });
  await page.route('**/api/admin/accounting?year=2026', (route) => route.fulfill({ json: { ok: true, data: state } }));
  await page.route('**/api/admin/accounting', (route) => {
    const body = route.request().postDataJSON(); operations.push(body);
    state.expenses = body.entries.map((entry) => ({ ...normalizeExpense(entry, 2026), version: 1 }));
    file.expense_id = state.expenses[0].id;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/admin/regnskap/browser-test');
  const dashboard = page.locator('.accounting-dashboard');
  await dashboard.getByRole('button', { name: 'Kostnader og bilag', exact: true }).click();
  await dashboard.getByLabel('Last opp kvitteringer').setInputFiles({ name: 'receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nSynthetic receipt') });
  const draft = dashboard.locator('.accounting-draft');
  await expect(draft).toHaveCount(1);
  await expect(draft.getByRole('textbox', { name: 'Lagt ut av', exact: true })).toHaveValue('Test Bruker');
  await draft.getByRole('textbox', { name: 'Lagt ut av', exact: true }).fill('Kari Test');
  const currency = draft.getByRole('combobox', { name: 'Valuta', exact: true });
  const rate = draft.getByLabel('Kurs: NOK per 1 valutaenhet');
  const amount = draft.getByLabel('Beløp i original valuta');
  await expect(draft).toHaveClass(/has-error/);
  await expect(draft.getByText('Beløpet mangler eller er ugyldig. Oppgi et positivt beløp fra bilaget.')).toBeVisible();
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await draft.screenshot({ path: testInfo.outputPath('accounting-missing-amount.png') });
  await amount.fill('16,25');
  await expect(draft.getByText('Beløpet mangler eller er ugyldig. Oppgi et positivt beløp fra bilaget.')).toHaveCount(0);
  await expect(amount).not.toHaveAttribute('aria-invalid');
  // A missing currency must block submission and explain why, even though the native select is hidden.
  await rate.fill('10,123456');
  await draft.getByRole('checkbox').check();
  await dashboard.getByRole('button', { name: 'Lagre 1 kostnader' }).click();
  await expect(dashboard.getByRole('alert')).toContainText('Kontroller at alle påkrevde felt er fylt ut riktig.');
  expect(operations).toHaveLength(0);
  await currency.click();
  await page.getByRole('option', { name: 'USD', exact: true }).click();
  await expect(currency).toHaveText('USD');
  await expect(dashboard.getByRole('alert')).toHaveCount(0);
  await expect(rate).toHaveValue('');
  await expect(draft.getByRole('checkbox')).not.toBeChecked();
  await currency.click();
  await page.getByRole('option', { name: 'NOK', exact: true }).click();
  await expect(rate).toHaveValue('1');
  await expect(rate).toBeDisabled();
  await currency.click();
  await page.getByRole('option', { name: 'USD', exact: true }).click();
  await expect(rate).toBeEnabled();
  await expect(rate).toHaveValue('');
  await rate.fill('10,123456');
  await draft.getByRole('checkbox').check();
  await dashboard.getByRole('button', { name: 'Lagre 1 kostnader' }).click();
  await expect(draft).toHaveCount(0);
  expect(operations).toHaveLength(1);
  expect(operations[0]).toMatchObject({ operation: 'batch', year: 2026, entries: [{ currency: 'USD', exchange_rate: '10,123456', reviewed: true }] });
  expect(state.expenses[0].amount_ore).toBe(16451);
  expect(state.expenses[0].claimant_name).toBe('Kari Test');
  await expect(dashboard.locator('.accounting-expenses tbody')).toContainText('Lagt ut av: Kari Test');
  await expect(dashboard.locator('.accounting-expenses tbody')).toContainText('USD');
  expect(consoleErrors.filter((message) => message.includes('same key'))).toEqual([]);
  await dashboard.locator('.accounting-expenses').getByRole('button', { name: 'Rediger', exact: true }).click();
  await expect(draft.getByRole('textbox', { name: 'Lagt ut av', exact: true })).toHaveValue('Kari Test');
  await page.setViewportSize({ width: testInfo.project.name === 'mobile' ? 480 : 1280, height: 900 });
  const actions = dashboard.locator('.accounting-actions');
  await expect(actions.getByRole('button', { name: 'Lagre endringer' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Avslutt redigering' })).toBeVisible();
  const [save, cancel] = await actions.getByRole('button').evaluateAll((buttons) => buttons.map((button) => {
    const { top, bottom, left, right } = button.getBoundingClientRect();
    return { top, bottom, left, right };
  }));
  expect(Math.abs(save.top - cancel.top)).toBeLessThan(1);
  expect(Math.abs(save.bottom - cancel.bottom)).toBeLessThan(1);
  expect(cancel.left).toBeGreaterThan(save.right);
  await actions.screenshot({ path: testInfo.outputPath('accounting-edit-actions.png') });
  await actions.getByRole('button', { name: 'Avslutt redigering' }).click();
  await dashboard.getByRole('button', { name: 'Legg til kostnad manuelt', exact: true }).click();
  await expect(draft.getByRole('textbox', { name: 'Lagt ut av', exact: true })).toHaveValue('Test Bruker');
  await draft.getByRole('textbox', { name: 'Lagt ut av', exact: true }).fill('');
  await expect(draft.getByRole('textbox', { name: 'Lagt ut av', exact: true })).toHaveValue('');
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

test('supplier batch requires receipt review and preserves individual amounts and status dates', async ({ page, context }) => {
  await authenticate(context);
  const state = { year: 2026, years: [2026], settings: { ...proposeAccountingYear(2026, 411), version: 1 }, memberCount: 420, invoicedMemberCount: 410, paidMemberCount: 400, collectionCandidateCount: 10, expenses: [], attachments: [] };
  const operations = [];
  await page.route('**/api/admin/accounting/files', async (route) => {
    const number = state.attachments.length + 1;
    const file = { id: String(number).repeat(32), year: 2026, expense_id: null, original_filename: `synthetic-${number}.pdf`, url: `/api/admin/accounting/files/${String(number).repeat(32)}`,
      uploaded_by: 'Test Bruker',
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
      state.expenses.forEach((expense) => { if (body.action === 'pay') expense.submitted_on ||= body.date; expense[body.action === 'submit' ? 'submitted_on' : 'paid_on'] = body.date; expense.version++; });
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
  // Choose and apply shared currency/rate through the UI; individual amounts must remain distinct.
  const drafts = dashboard.locator('.accounting-draft');
  await expect(drafts.nth(0).getByRole('textbox', { name: 'Lagt ut av', exact: true })).toHaveValue('Test Bruker');
  await drafts.nth(1).getByRole('textbox', { name: 'Lagt ut av', exact: true }).fill('Kari Test');
  const shared = dashboard.locator('.accounting-batch-defaults');
  await shared.getByRole('combobox', { name: 'Valuta', exact: true }).click();
  await page.getByRole('option', { name: 'USD', exact: true }).click();
  await expect(shared.getByRole('combobox', { name: 'Valuta', exact: true })).toHaveText('USD');
  await shared.getByLabel('Kurs: NOK per 1 valutaenhet').fill('10.123456');
  await shared.getByRole('button', { name: 'Bruk på alle bilag' }).click();
  await expect(drafts.nth(0).getByRole('combobox', { name: 'Valuta', exact: true })).toHaveText('USD');
  await expect(drafts.nth(1).getByRole('combobox', { name: 'Valuta', exact: true })).toHaveText('USD');
  await dashboard.getByRole('button', { name: 'Lagre 2 kostnader' }).click();
  await expect(dashboard.getByRole('alert')).toContainText('Kontroller og bekreft hvert bilag før lagring.');
  expect(operations).toHaveLength(0);
  await drafts.nth(0).getByRole('checkbox').check(); await drafts.nth(1).getByRole('checkbox').check();
  await dashboard.getByRole('button', { name: 'Lagre 2 kostnader' }).click();
  await expect(drafts).toHaveCount(0);
  expect(operations[0].entries.map((entry) => entry.amount)).toEqual(['16.25', '10.00']);
  expect(operations[0].entries.map((entry) => entry.claimant_name)).toEqual(['Test Bruker', 'Kari Test']);
  await dashboard.getByRole('checkbox', { name: 'Velg alle viste kostnader' }).check();
  await dashboard.getByLabel('Dato for statusendring').fill('2026-09-20');
  await expect(dashboard.getByRole('button', { name: 'Merk som utbetalt' })).toBeEnabled();
  await dashboard.getByRole('button', { name: 'Merk som utbetalt' }).click();
  await expect(dashboard.getByText('Levert: 2026-09-20', { exact: true })).toHaveCount(2);
  await expect(dashboard.getByText('Utbetalt: 2026-09-20', { exact: true })).toHaveCount(2);
});

test('annual-fee imports require a clean preview before applying', async ({ page, context }) => {
  await authenticate(context);
  const calls = [];
  await page.route('**/api/admin/accounting/fees/import', async (route) => {
    const body = await route.request().postDataBuffer(); calls.push(body.toString());
    const apply = body.toString().includes('true');
    await route.fulfill({ json: { ok: true, applied: apply, preview: { rowCount: 2, matchedCount: 2, unmatchedCount: 0, unmatched: [] } } });
  });
  await page.route('**/api/admin/accounting?year=2026', (route) => route.fulfill({ json: { ok: true, data: {
    year: 2026, years: [2026], settings: { ...proposeAccountingYear(2026, 411), version: 1 }, memberCount: 420,
    invoicedMemberCount: 412, paidMemberCount: 400, collectionCandidateCount: 12, exemptMemberCount: 8, expenses: [], attachments: [],
  } } }));
  await page.goto('/admin/regnskap/browser-test');
  const dashboard = page.locator('.accounting-dashboard');
  await dashboard.getByRole('button', { name: 'Kontingentoppfølging', exact: true }).click();
  await expect(dashboard.getByRole('link', { name: /Forventet antall medlemmer 420/ })).toHaveAttribute('href', '/admin/members?membership=member');
  await expect(dashboard.getByRole('link', { name: /Unntatt medlemskap 8/ })).toHaveAttribute('href', '/admin/members?membership=exempt');
  await expect(dashboard.getByText('Aktuelle for inkasso').locator('..')).toContainText('10');
  await dashboard.getByLabel('CSV-fil').setInputFiles({ name: 'fakturert.csv', mimeType: 'text/csv', buffer: Buffer.from('member_id\n42\n43\n') });
  await dashboard.getByRole('button', { name: 'Kontroller fil' }).click();
  await expect(dashboard.getByText('2 av 2 rader matcher medlemstomter.')).toBeVisible();
  await dashboard.getByRole('button', { name: 'Importer og merk tomtene' }).click();
  await expect(dashboard.getByText('2 medlemstomter ble oppdatert.')).toBeVisible();
  expect(calls).toHaveLength(2);
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

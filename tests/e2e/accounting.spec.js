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

test('annual dues shows ownership exclusions and delivery diagnostics without changing the historical balance', async ({ page, context }, testInfo) => {
 await authenticate(context);
 const invoice={id:'a'.repeat(32),member_id:'1',number:'AK-2026-1',issued_on:'2026-10-10',due_on:'2026-10-24',amount_ore:25000,paid_ore:10000,
  snapshot:{h_number:'DEMO-101',street_address:'Eksempelvegen 1',recipient_name:'Test Eier',invoice_address:'Fakturavegen 1',title_holder:'Test Eier',registration_date:'2025-01-01'},
  current_title_holder:'Test Eier',current_registration_date:'2025-01-01',eligibility:'eligible',current_email:'test@example.test',payments:[],deliveries:[{id:'d',attempt:1,recipient:'test@example.test',status:'bounced',queued_at:'2026-10-10T10:00:00Z',sent_at:'2026-10-10T10:01:00Z',failed_at:'2026-10-10T10:02:00Z',provider_message_id:'synthetic-provider-id',failure_reason:'activity.hard_bounced',detail:{enhanced_code:'5.1.1',reason:'Mailbox does not exist'},events:[]}]};
 await page.route('**/api/admin/accounting/dues?*',route=>route.fulfill({json:{ok:true,data:{year:2026,installed:true,yearClosed:false,sendingEnabled:false,
  campaign:{amount_ore:25000,number_prefix:'AK-2026-',next_number:2,sender:{bank_account:'synthetic'}},invoices:[invoice],candidates:[],
  excluded:[{id:'2',h_number:'DEMO-102',street_address:'Ettervegen 2',registration_date:'2026-02-02',eligibility:'after_cutoff'},{id:'3',h_number:'DEMO-103',street_address:'Ukjentvegen 3',registration_date:null,eligibility:'review'}]}}}));
 await page.goto('/admin/regnskap/browser-test');
 const dashboard=page.locator('.accounting-dashboard');await dashboard.getByRole('button',{name:'Fakturering',exact:true}).click();
 await expect(dashboard.getByRole('heading',{name:'Tomter holdt utenfor fakturering (2)'})).toBeVisible();
 await expect(dashboard.getByText('Hjemmel etter 1. februar · først aktuelt 2027')).toBeVisible();await expect(dashboard.getByText('Må avklares før fakturering',{exact:true})).toBeVisible();
 await expect(dashboard.getByText('E-postsending er avskrudd',{exact:false})).toBeVisible();
 await dashboard.getByText('Utsendelser og betalinger · AK-2026-1',{exact:true}).click();
 const history=dashboard.locator('.finance-history');
 await expect(history.getByText('Mottakerens postkasse finnes ikke.',{exact:false})).toBeVisible();await expect(history.getByText('synthetic-provider-id')).toBeVisible();
 await expect(dashboard.getByRole('button',{name:'Send kopi',exact:true})).toBeDisabled();
 await dashboard.getByRole('combobox',{name:'Vis fakturaer',exact:true}).selectOption('paid');await expect(dashboard.getByText('DEMO-101 · AK-2026-1',{exact:false})).toHaveCount(0);
 await dashboard.getByRole('combobox',{name:'Vis fakturaer',exact:true}).selectOption('unpaid');await expect(dashboard.getByText('DEMO-101 · AK-2026-1',{exact:false})).toBeVisible();
 if(testInfo.project.name==='mobile')await page.setViewportSize({width:320,height:800});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.addScriptTag({content:axe.source});const result=await page.evaluate(async()=>window.axe.run('.finance-workspace',{runOnly:['wcag2a','wcag2aa','wcag21aa']}));expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('annual-dues.png'),fullPage:true});
 await dashboard.getByRole('button',{name:'Oversikt',exact:true}).click();await expect(dashboard.getByText('Sum formue').locator('..')).toContainText(/49.636,85/);
});

test('invoice failure overview shows provider reasons, separates history and preserves details on lookup failure without sending',async({page,context},testInfo)=>{
 await authenticate(context);const requests=[];let lookupFails=false;
 const invoice=(number,deliveries,extra={})=>({id:String(number).repeat(32),member_id:String(number),number:`AK-2026-${number}`,issued_on:'2026-10-10',due_on:'2026-10-24',amount_ore:25000,paid_ore:0,
  snapshot:{h_number:String(number),street_address:`Eksempelvegen ${number}`,recipient_name:`Test Eier ${number}`,invoice_address:`member${number}@example.test`,title_holder:`Test Eier ${number}`,registration_date:'2025-01-01'},
  current_email:`current${number}@example.test`,current_title_holder:`Test Eier ${number}`,current_registration_date:'2025-01-01',eligibility:'eligible',payments:[],deliveries,...extra});
 const delivery=(id,status,detail={})=>({id,status,attempt:1,recipient:`${id}@example.test`,subject:'Årskontingent 2026',queued_at:'2026-10-10T20:00:00Z',failed_at:'2026-10-10T20:01:00Z',failure_reason:status==='suppressed'?'RECIPIENT_SUPPRESSED':'activity.hard_bounced',detail,events:[]});
 const invoices=[invoice(1,[delivery('suppressed-1','suppressed')]),invoice(2,[delivery('bounce-2','bounced',{reason:'550 5.1.1 Not found',enhanced_code:'5.1.1',http_status:422,provider_code:'MS42215',validation_errors:[{field:'attachments.0.content',messages:['Invalid Base64']} ]})]),
  invoice(3,[delivery('old-3','failed'),{...delivery('new-3','sent'),attempt:2,failure_reason:null}]),invoice(4,[delivery('credited-4','suppressed')],{credit_number:'CR-2026-1'})];
 await page.route('**/api/admin/accounting/dues**',route=>{
  const request=route.request();requests.push({method:request.method(),url:request.url()});
  if(request.url().includes('diagnostics=delivery')){
   if(lookupFails)return route.fulfill({status:503,json:{ok:false,code:'unavailable'}});
   return route.fulfill({json:{ok:true,data:{checked_at:'2026-10-10T20:30:00Z',deliveries:{'suppressed-1':{lookup_complete:true,suppression_reasons:[{type:'hard-bounces',reason:'Mailbox unavailable',created_at:'2026-09-18T16:36:57.000Z',provider_id:'synthetic-suppression',recipient_id:'synthetic-recipient'}]}},limitations:[{operation:'recipient_history',http_status:403,code:'UPSTREAM'}]}}});
  }
  return route.fulfill({json:{ok:true,data:{year:2026,installed:true,yearClosed:false,sendingEnabled:false,campaign:{amount_ore:25000,number_prefix:'AK-2026-',next_number:5,sender:{bank_account:'synthetic'}},invoices,candidates:[],excluded:[]}}});
 });
 await page.goto('/admin/regnskap/browser-test');const dashboard=page.locator('.accounting-dashboard');await dashboard.getByRole('button',{name:'Fakturering',exact:true}).click();
 const errors=dashboard.locator('details.finance-section').filter({has:page.getByRole('heading',{name:'Utsendelsesfeil og sperrede mottakere (2)',exact:true})});
 await expect(errors.locator('.finance-failure-card')).toHaveCount(2);
 await expect(errors.getByText('MailerSend: Mailbox unavailable',{exact:true})).toBeVisible();await expect(errors.getByText('Mottakerens postkasse er utilgjengelig.',{exact:false}).first()).toBeVisible();
 await errors.getByText('Vis alle feildetaljer · AK-2026-1',{exact:true}).click();await errors.getByText('Vis alle feildetaljer · AK-2026-2',{exact:true}).click();
 await expect(errors.getByText('HTTP 403',{exact:false})).toBeVisible();await expect(errors.getByText('current1@example.test',{exact:false})).toBeVisible();await expect(errors.getByText('suppressed-1@example.test',{exact:true})).toBeVisible();
 await expect(errors.getByText('Invalid Base64',{exact:false})).toBeVisible();
 const search=errors.getByLabel('Søk i utsendelsesfeil');await search.fill('Mailbox unavailable');await expect(errors.locator('.finance-failure-card')).toHaveCount(1);await search.fill('');
 await errors.getByLabel('Vis også tidligere feil og krediterte fakturaer').check();await expect(errors.locator('.finance-failure-card')).toHaveCount(4);
 await search.fill('AK-2026-3');await expect(errors.getByText('Historisk feil · siste forsøk: Godtatt av mailtjenesten')).toBeVisible();
 await search.fill('');await errors.getByLabel('Vis også tidligere feil og krediterte fakturaer').uncheck();
 lookupFails=true;await errors.getByRole('button',{name:'Oppdater feilinformasjon fra MailerSend'}).click();
 await expect(errors.getByRole('alert')).toContainText('Registrerte feil vises fortsatt');await expect(errors.getByText('MailerSend: Mailbox unavailable',{exact:true})).toBeVisible();
 expect(requests.every(r=>r.method==='GET')).toBe(true);expect(requests.filter(r=>r.url.includes('diagnostics=delivery')).length).toBeGreaterThanOrEqual(2);
 if(testInfo.project.name==='mobile')await page.setViewportSize({width:320,height:800});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.addScriptTag({content:axe.source});const result=await page.evaluate(async()=>window.axe.run('.finance-failures',{runOnly:['wcag2a','wcag2aa','wcag21aa']}));expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
 const summary=errors.getByText('Vis alle feildetaljer · AK-2026-1',{exact:true});await summary.focus();await summary.press('Enter');
 await expect(errors.locator('details.finance-failure-details[open]')).toHaveCount(1);await summary.press('Space');await expect(errors.locator('details.finance-failure-details[open]')).toHaveCount(0);
 await errors.screenshot({path:testInfo.outputPath('invoice-delivery-failures.png')});
});

test('annual dues uses the member owner and primary email without address preparation', async ({ page, context }) => {
 await authenticate(context);
 const settings={version:2,name:'Eksempelvel',sender_address:'Eksempelvel',bank_account:'86011117947',organization_number:'123456785',phone:'123 45 678',reply_to:'post@example.test',website:'www.example.test'};
 let invoices=[];const writes=[];
 const candidate={id:'42',h_number:'DEMO-104',street_address:'Eksempelvegen 4',title_holder:'Test Eier',primary_contact_name:'Kontaktperson',primary_contact_email:'faktura@example.test',registration_date:'2025-01-01',eligibility:'eligible',has_active_invoice:false,replaces_id:null};
 await page.route('**/api/admin/accounting/dues**',async route=>{
  const request=route.request();
  if(request.method()==='GET')return route.fulfill({json:{ok:true,data:{year:2026,installed:true,yearClosed:false,sendingEnabled:false,invoiceSettings:settings,campaign:{amount_ore:25000,number_prefix:'AK-2026-',next_number:1,tax_treatment:{text:'Årskontingent unntatt merverdiavgift'},sender:{vat:'Årskontingent unntatt merverdiavgift'}},invoices,candidates:[candidate],excluded:[]}}});
  const input=request.postDataJSON();writes.push(input);
  if(input.operation==='issue'){invoices=[{id:input.id,member_id:'42',number:'AK-2026-1',issued_on:input.date,due_on:'2026-10-24',amount_ore:25000,paid_ore:0,snapshot:{h_number:candidate.h_number,street_address:candidate.street_address,recipient_name:'Test Eier',invoice_address:'faktura@example.test',title_holder:'Test Eier',registration_date:'2025-01-01'},current_title_holder:'Test Eier',current_registration_date:'2025-01-01',eligibility:'eligible',current_email:'faktura@example.test',payments:[],deliveries:[]}];return route.fulfill({json:{ok:true,result:{id:input.id,number:'AK-2026-1'}}});}
  throw new Error(`Unexpected mutation ${input.operation}`);
 });
 await page.goto('/admin/regnskap/browser-test');const dashboard=page.locator('.accounting-dashboard');
 await dashboard.getByRole('button',{name:'Fakturering',exact:true}).click();
 await expect(dashboard.getByText('Test Eier')).toBeVisible();await expect(dashboard.getByText('faktura@example.test')).toBeVisible();
 await expect(dashboard.getByRole('button',{name:'Kontroller faktura'})).toHaveCount(0);
 await expect(dashboard.getByRole('button',{name:'Utsted faktura'})).toBeVisible();
 await dashboard.getByRole('button',{name:'Utsted faktura'}).click();
 await expect(dashboard.getByText('Lagret.',{exact:true})).toBeVisible();
 expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({operation:'issue',member_id:'42',invoice_settings_version:2});
 expect(writes[0]).not.toHaveProperty('recipient_name');expect(writes[0]).not.toHaveProperty('invoice_address');expect(writes[0]).not.toHaveProperty('reviewed');
});

test('invoice sections support keyboard collapse, keep drafts after refresh and never submit from navigation', async ({ page, context }, testInfo) => {
 await authenticate(context);
 const writes=[];
 const settings={version:2,name:'Eksempelvel',sender_address:'Eksempelvegen 1',bank_account:'86011117947',reply_to:'post@example.test'};
 await page.route('**/api/admin/accounting/dues**',route=>{
  if(route.request().method()!=='GET')writes.push(route.request().postDataJSON());
  return route.fulfill({json:{ok:true,data:{year:2026,installed:true,yearClosed:false,sendingEnabled:true,sendingMode:'live',invoiceSettings:settings,campaign:null,invoices:[],candidates:[],excluded:[]}}});
 });
 await page.goto('/admin/regnskap/browser-test');
 const dashboard=page.locator('.accounting-dashboard');
 await dashboard.getByRole('button',{name:'Fakturering',exact:true}).click();
 const finance=dashboard.locator('.finance-workspace');
 const sections=finance.locator('details.finance-section');
 const campaign=sections.filter({has:page.getByRole('heading',{name:'Start årets kampanje',exact:true})});
 const summary=campaign.locator('summary');
 const prefix=campaign.getByLabel('Prefiks i fakturanummer');
 await prefix.fill('AK-2026-UTKAST-');
 await summary.focus();await summary.press('Enter');
 await expect(prefix).not.toBeVisible();
 const refreshed=page.waitForResponse(response=>response.url().includes('/api/admin/accounting/dues?'));
 await finance.getByRole('button',{name:'Oppdater fakturalisten'}).click();await refreshed;
 await expect(campaign).not.toHaveAttribute('open');
 await summary.focus();await summary.press('Space');
 await expect(prefix).toBeVisible();await expect(prefix).toHaveValue('AK-2026-UTKAST-');
 await finance.getByRole('button',{name:'Lukk alle seksjoner'}).click();
 await expect(finance.locator('details.finance-section[open]')).toHaveCount(0);
 await finance.getByRole('button',{name:'Åpne alle seksjoner'}).click();
 await expect(finance.locator('details.finance-section:not([open])')).toHaveCount(0);
 await expect(prefix).toHaveValue('AK-2026-UTKAST-');expect(writes).toEqual([]);
 if(testInfo.project.name==='mobile')await page.setViewportSize({width:320,height:800});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.addScriptTag({content:axe.source});
 const result=await page.evaluate(async()=>window.axe.run('.finance-workspace',{runOnly:['wcag2a','wcag2aa','wcag21aa']}));
 expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
 await finance.getByRole('button',{name:'Lukk alle seksjoner'}).click();
 await page.screenshot({path:testInfo.outputPath('invoice-sections-collapsed.png'),fullPage:true});
});

test('annual dues test mode limits manual sending and labels the email TEST', async ({ page, context }) => {
 await authenticate(context);
 const settings={version:2,name:'Eksempelvel',sender_address:'Eksempelvel\nEksempelvegen 1\n0000 Eksempel',bank_account:'86011117947',organization_number:'123456785',phone:'123 45 678',reply_to:'post@example.test',website:'www.example.test'};
 const invoice={id:'b'.repeat(32),member_id:'25',number:'AK-2026-1',issued_on:'2026-10-10',due_on:'2026-10-24',amount_ore:25000,paid_ore:0,snapshot:{h_number:'25',street_address:'Nedre Turusvingen 16',recipient_name:'Test Eier',invoice_address:'test@example.test',title_holder:'Test Eier',registration_date:'2025-01-01'},current_title_holder:'Test Eier',current_registration_date:'2025-01-01',eligibility:'eligible',current_email:'test@example.test',is_test_target:true,payments:[],deliveries:[]};
 const writes=[];
 await page.route('**/api/admin/accounting/dues**',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{ok:true,data:{year:2026,installed:true,yearClosed:false,sendingEnabled:true,sendingMode:'test',invoiceSettings:settings,campaign:{amount_ore:25000,number_prefix:'AK-2026-',next_number:2,sender:{bank_account:'86011117947'}},invoices:[invoice],candidates:[],excluded:[]}}});
  writes.push(route.request().postDataJSON());return route.fulfill({json:{ok:true,result:{id:invoice.id,queued:true}}});
 });
 await page.goto('/admin/regnskap/browser-test');const dashboard=page.locator('.accounting-dashboard');
 await dashboard.getByRole('button',{name:'Fakturering',exact:true}).click();
 await expect(dashboard.getByText('Testmodus er aktiv.',{exact:false})).toBeVisible();
 await expect(dashboard.getByRole('button',{name:/Send alle usendte/})).toHaveCount(0);
 await dashboard.getByRole('button',{name:'Send testfaktura'}).click();
 await expect(dashboard.getByRole('heading',{name:'Send testfaktura',exact:true})).toBeVisible();
 await expect(dashboard.getByText('TEST først i emnefeltet',{exact:false})).toBeVisible();
 await dashboard.getByRole('button',{name:'Legg testfaktura i sendekø'}).click();
 expect(writes).toEqual([expect.objectContaining({operation:'queue',invoice_id:invoice.id,test:true})]);
});

test('invoice settings feed the campaign and require explicit VAT exemption confirmation', async ({ page, context }, testInfo) => {
 await authenticate(context);
 let settings={version:1,name:'Eksempelvel',sender_address:'Eksempelvel\nEksempelvegen 1\n0000 Eksempel',bank_account:'',organization_number:'123456785',phone:'123 45 678',reply_to:'post@example.test',website:'www.example.test'};
 let campaign=null;const writes=[];
 await page.route('**/api/admin/accounting/dues**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='GET')return route.fulfill({json:{ok:true,data:url.searchParams.get('settings')==='invoice'?settings:{year:2026,installed:true,yearClosed:false,sendingEnabled:false,invoiceSettings:settings,campaign,invoices:[],candidates:[],excluded:[]}}});
  const input=request.postDataJSON();writes.push(input);
  if(input.operation==='invoice_settings'){settings={...input,version:input.version+1,bank_account:input.bank_account.replace(/[ .]/g,'')};return route.fulfill({json:{ok:true,result:settings}});}
  if(input.operation==='campaign'){campaign={amount_ore:25000,number_prefix:'AK-2026-',next_number:1,tax_treatment:{type:'exempt',reason:'Årskontingent',text:'Årskontingent unntatt merverdiavgift'},sender:{vat:'Årskontingent unntatt merverdiavgift'}};return route.fulfill({json:{ok:true,result:{year:2026}}});}
  throw new Error(`Unexpected mutation ${input.operation}`);
 });
 await page.goto('/admin/regnskap/browser-test');const dashboard=page.locator('.accounting-dashboard');
 await dashboard.getByRole('button',{name:'Fakturering',exact:true}).click();
 await expect(dashboard.getByRole('button',{name:'Start kampanjen',exact:true})).toBeDisabled();
 await dashboard.getByRole('button',{name:'Åpne fakturainnstillinger'}).click();
 await expect(dashboard.getByLabel('Foreningens adresse')).toHaveValue(settings.sender_address);
 await dashboard.getByLabel('Bankkontonummer').fill('8601.11.17947');
 await dashboard.getByLabel('Foreningens adresse').fill('Eksempelvel\nNyvegen 2\n0001 Eksempel');
 await dashboard.getByRole('button',{name:'Lagre fakturainnstillinger'}).click();
 await expect(dashboard.getByRole('status').filter({hasText:'Fakturainnstillingene er lagret.'})).toBeVisible();
 await expect(dashboard.getByLabel('Bankkontonummer')).toHaveValue('86011117947');
 if(testInfo.project.name==='mobile')await page.setViewportSize({width:320,height:800});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.addScriptTag({content:axe.source});const accessibility=await page.evaluate(async()=>window.axe.run('.accounting-dashboard',{runOnly:['wcag2a','wcag2aa','wcag21aa']}));expect(accessibility.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('invoice-settings.png'),fullPage:true});
 await dashboard.getByRole('button',{name:'Fakturering',exact:true}).click();
 await expect(dashboard.getByText('Bankkonto: 86011117947',{exact:false})).toBeVisible();
 const start=dashboard.getByRole('button',{name:'Start kampanjen',exact:true});
 await dashboard.getByLabel('Avsender, bankkonto, tidligere fakturering og ledig nummerserie er kontrollert').check();
 await start.click();expect(writes.filter(i=>i.operation==='campaign')).toHaveLength(0);
 await dashboard.getByLabel('Avgiftsunntak for kampanjen: Årskontingent er unntatt merverdiavgift').check();
 await dashboard.getByLabel('Avsender, bankkonto, tidligere fakturering og ledig nummerserie er kontrollert').check();
 await start.click();
 await expect(dashboard.getByText('Avgiftsbehandling for kampanjen: Årskontingent unntatt merverdiavgift')).toBeVisible();
 expect(writes.at(-1)).toMatchObject({operation:'campaign',vat_exempt:true,invoice_settings_version:2});
 expect(writes.at(-1)).not.toHaveProperty('bank_account');expect(writes.at(-1)).not.toHaveProperty('sender_address');
});

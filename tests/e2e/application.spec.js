import { test, expect } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { testAdmin, testAuthSecret, testOrigin, testTenant } from './environment.mjs';
import { surveyId } from '../../data/survey.js';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => new URL(route.request().url()).origin === testOrigin ? route.continue() : route.abort());
});

async function authenticate(context, roles = ['TFV.MemberAdmin', 'TFV.SurveyAdmin', 'TFV.CmsEditor', 'TFV.SecurityAudit']) {
  const name = 'authjs.session-token';
  const value = await encode({ secret: testAuthSecret, salt: name, maxAge: 3600,
    token: { sub: 'synthetic-admin', name: 'Testadministrator', email: testAdmin, tenantId: testTenant, roles } });
  await context.addCookies([{ name, value, url: testOrigin, httpOnly: true, sameSite: 'Lax' }]);
}

test('shared select supports keyboard, ordinary form values, reset and language round-trip', async ({ page, context }) => {
  await authenticate(context); await page.goto('/admin/browser-test');
  const form = page.getByRole('form', { name: 'Test av nedtrekksliste' });
  const select = form.getByRole('combobox', { name: 'Farge' });
  await select.focus(); await select.press('Enter'); await select.press('ArrowDown'); await select.press('Enter');
  await expect(select).toContainText('Rød');
  expect(await form.evaluate((element) => new FormData(element).get('color'))).toBe('red');
  await form.getByRole('button', { name: 'Tilbakestill valg' }).click();
  await expect(select).toContainText('Blå');
  await select.click(); await page.keyboard.press('Escape'); await expect(select).toBeFocused();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Språk', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/lang=en/);
  await page.getByRole('combobox', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: 'Norsk', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Språk', exact: true })).toContainText('Norsk');
});

test('custom multiple choices submit arrays and explain a non-counted later response', async ({ page, context }) => {
  await authenticate(context); await page.goto('/admin/browser-test');
  const form = page.getByRole('region', { name: 'Test av flervalg' });
  let payload;
  await page.route('**/survey/api/responses', (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { ok: true, accepted: false } });
  });
  await form.getByText('Skitur', { exact: true }).click();
  await form.getByText('Fottur', { exact: true }).click();
  await form.getByText('Vet ikke', { exact: true }).click();
  await form.getByRole('button', { name: /Send/ }).click();
  await expect.poll(() => payload?.answers).toEqual({ q1: ['ski', 'walk'], q2: 'usikker' });
  await expect(form).toContainText('Ditt svar erstatter ikke dette');
  await expect(form.getByRole('checkbox')).toHaveCount(0);
});

test('public pageviews send only coarse anonymous dimensions and usage dashboard requires audit access', async ({ page, context }) => {
  let payload;
  await page.route('**/api/usage/pageview', (route) => {
    payload = route.request().postDataJSON();
    expect(route.request().headers().cookie).toBeUndefined();
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'Bilder fra Turufjell' });
  await expect(carousel).toBeVisible();
  await expect.poll(() => carousel.getByRole('img').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(carousel.getByText(/^Foto: /)).toBeVisible();
  await carousel.getByRole('button', { name: 'Pause automatisk bildebytte' }).click();
  await carousel.getByRole('button', { name: /^Bilde 1 av / }).click();
  await expect(carousel.getByRole('button', { name: /^Bilde 1 av / })).toHaveAttribute('aria-current', 'true');
  await carousel.focus();
  await carousel.press('ArrowRight');
  await expect(carousel.getByRole('button', { name: /^Bilde 2 av / })).toHaveAttribute('aria-current', 'true');
  const expectedDevice = page.viewportSize().width < 768 ? 'mobile' : page.viewportSize().width < 1100 ? 'tablet' : 'desktop';
  await expect.poll(() => payload).toEqual({ pageType: 'home', deviceCategory: expectedDevice });
  expect(Object.keys(payload).sort()).toEqual(['deviceCategory', 'pageType']);

  await authenticate(context);
  await page.goto('/admin/usage');
  await expect(page.getByRole('heading', { name: 'Bruksstatistikk', exact: true })).toBeVisible();
  await expect(page.getByText(/IP-adresser, cookies, bruker-ID-er/)).toBeVisible();

  await page.goto('/admin/browser-test');
  const usage = page.getByRole('region', { name: 'Test av bruksstatistikk' });
  const chart = usage.getByRole('img', { name: /Sidevisninger over tid/ });
  await expect(chart).toBeVisible();
  await chart.focus();
  await expect(chart).toHaveAttribute('aria-label', /15\. sep.*2 sidevisninger/i);
  await chart.press('ArrowLeft');
  await expect(chart).toHaveAttribute('aria-label', /14\. sep.*7 sidevisninger/i);
  await expect(usage.getByRole('table', { name: /Aggregerte sidevisninger/ })).toBeVisible();
});

test('matrikkel picker filters members and starts an exact one-member run', async ({ page, context }) => {
  let payload;
  await page.route('**/api/admin/matrikkel/runs', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { ok: true, backgroundStarted: false, run: {
      id: 'b'.repeat(32), status: 'completed', requested_by: 'browser-test@turufjellvel.no',
      h_number_filter: 'H392', selected_member_id: '702', total_count: 1, processed_count: 1,
      updated_count: 1, unchanged_count: 0, review_count: 0, error_count: 0, backup_count: 1,
    } } });
  });
  await authenticate(context);
  await page.goto('/admin/browser-test');
  const picker = page.getByRole('region', { name: 'Test av matrikkelvalg' });
  await picker.getByRole('searchbox', { name: 'Søk etter medlem' }).fill('sprenåsen');
  const select = picker.getByRole('combobox', { name: 'Medlem' });
  await select.click();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
  await page.getByRole('option', { name: /H392/ }).click();
  const updateButton = picker.getByRole('button', { name: 'Oppdater valgt medlem' });
  const memberSelectBox = await select.boundingBox();
  const updateButtonBox = await updateButton.boundingBox();
  expect(Math.abs(memberSelectBox.y - updateButtonBox.y)).toBeLessThanOrEqual(1);
  await updateButton.click();
  const dialog = page.getByRole('alertdialog', { name: /Oppdatere H392/ });
  await expect(dialog).toContainText('Bare dette medlemmet tas med');
  await dialog.getByRole('button', { name: 'Oppdater medlem' }).click();
  await expect.poll(() => payload).toEqual({ hNumber: null, memberId: '702' });
  await expect(picker.getByRole('heading', { name: 'Fullført' })).toBeVisible();
  await expect(picker.getByText(/^Siste kjøring.*H392.*Øvre Sprenåsen 37/)).toBeVisible();
});

test('profile keeps property scope, renders comments as text and preserves edits on expired session', async ({ page, context }) => {
  await authenticate(context); await page.goto('/admin/browser-test');
  await expect(page.getByRole('navigation', { name: 'Dine tomter' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Last ned som JSON' })).toHaveAttribute('href', '/api/member-access/export?member=7001');
  await expect(page.getByText('<img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
  await expect(page.locator('.member-comment-text img')).toHaveCount(0);
  const contact = page.getByRole('region', { name: 'Kontaktopplysninger og deling', exact: true });
  await contact.getByLabel('Kontaktperson', { exact: true }).fill('Ny syntetisk kontakt');
  await contact.getByLabel('Kommentar til endringen (valgfritt)').fill('En syntetisk retting');
  let payload;
  await page.route('**/api/member-access/profile', async (route) => { payload = route.request().postDataJSON(); await route.fulfill({ status: 401, json: { ok: false, message: 'Økten er utløpt. Be om ny lenke.' } }); });
  await contact.getByRole('button', { name: 'Lagre opplysninger', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Økten er utløpt' })).toBeVisible();
  expect(payload.memberId).toBe('7001'); expect(payload.comment).toBe('En syntetisk retting');
  await expect(contact.getByLabel('Kontaktperson', { exact: true })).toHaveValue('Ny syntetisk kontakt');
  await page.route('**/api/member-access/profile', (route) => route.fulfill({ json: { ok: true, message: 'Kontaktopplysningene er lagret.', member: { primary_contact_name: 'Ny syntetisk kontakt' } } }));
  await contact.getByRole('button', { name: 'Lagre opplysninger', exact: true }).click();
  await expect(contact.getByLabel('Kommentar til endringen (valgfritt)')).toHaveValue('');
});

test('inbox acknowledgement preserves comment on error and removes only acknowledged item after retry', async ({ page, context }) => {
  await authenticate(context); await page.goto('/admin/browser-test');
  const inbox = page.getByRole('region', { name: 'Henvendelser', exact: true });
  await expect(inbox.getByText('<b>Syntetisk kommentar</b>', { exact: true })).toBeVisible();
  let calls = 0;
  await page.route('**/api/admin/member-requests/7003', (route) => {
    expect(route.request().postDataJSON()).toEqual({ action: 'acknowledge_comment' });
    return route.fulfill(++calls === 1 ? { status: 503, json: { ok: false, message: 'Kunne ikke lagre. Prøv igjen.' } } : { json: { ok: true } });
  });
  const acknowledge = inbox.getByRole('button', { name: 'Marker kommentar som lest' });
  await acknowledge.click(); await expect(acknowledge).toBeEnabled();
  await expect(inbox.getByText('Kunne ikke lagre. Prøv igjen.')).toBeVisible();
  await acknowledge.click(); await expect(acknowledge).toHaveCount(0);
  await expect(inbox.getByText(/Historikken er beholdt/)).toBeVisible();
});

test('audit details work by keyboard, escape displayed values and preserve filters in pagination', async ({ page, context }) => {
  await authenticate(context); await page.goto('/admin/browser-test');
  const audit = page.getByRole('region', { name: 'Brukerendringer', exact: true });
  const summary = audit.locator('summary'); await summary.focus(); await summary.press('Enter');
  await expect(audit.getByText('<script>Syntetisk etter</script>', { exact: true })).toBeVisible();
  await expect(audit.locator('pre script')).toHaveCount(0);
  await expect(audit.getByRole('link', { name: 'Neste' })).toHaveAttribute('href', /q=Syntetisk/);
  await expect(audit.getByRole('link', { name: 'Neste' })).toHaveAttribute('href', /page=2/);
  await audit.getByRole('searchbox', { name: 'Søk', exact: true }).fill('nytt søk');
  await expect(audit.getByRole('button', { name: 'Filtrer', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/audit\?.*q=nytt\+s%C3%B8k/);
});

test('newsletter requires saved groups and preview, supports test errors and cancelled dispatch', async ({ page, context }) => {
  await authenticate(context); await page.goto('/admin/browser-test');
  const section = page.getByRole('region', { name: 'Test av nyhetsbrev' });
  let campaign; const actions = [];
  await page.route('**/api/admin/newsletters*', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { campaigns: [campaign], campaign, deliveries: [], bulkEnabled: true } });
    const input = route.request().postDataJSON(); actions.push(input.action);
    if (input.action === 'save') { campaign = { id: 'e'.repeat(32), subject: input.subject, body: input.body, group_ids: input.groupIds, status: 'draft', created_at: '2026-09-15T12:00:00Z' }; return route.fulfill({ json: { ok: true, campaign } }); }
    if (input.action === 'preview') return route.fulfill({ json: { campaign, recipientCount: 2 } });
    return route.fulfill({ status: 503, json: { message: 'Testmail kunne ikke sendes.' } });
  });
  await section.getByRole('button', { name: 'Nytt nyhetsbrev' }).click();
  await section.getByRole('textbox', { name: 'Emne', exact: true }).fill('Syntetisk nyhetsbrev');
  await section.locator('[contenteditable=true]').fill('Syntetisk nyhetsinnhold.');
  await expect(section.getByRole('button', { name: 'Lagre utkast' })).toBeDisabled();
  await section.getByRole('checkbox', { name: /Syntetisk e-postgruppe/ }).check();
  await section.getByRole('button', { name: 'Lagre utkast' }).click();
  await expect(section.getByRole('button', { name: 'Start utsending', exact: true })).toBeDisabled();
  await section.getByRole('button', { name: 'Forhåndsvis og tell mottakere' }).click();
  await expect(section.getByRole('region', { name: 'Forhåndsvisning' })).toContainText('2 unike adresser');
  await section.getByRole('textbox', { name: 'Testmottaker', exact: true }).fill('synthetic@example.invalid');
  await section.getByRole('button', { name: 'Send testmail', exact: true }).click();
  await expect(section.getByText('Testmail kunne ikke sendes.')).toBeVisible();
  await section.getByRole('button', { name: 'Start utsending', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Bestille utsending?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Bestill utsending' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(section.getByRole('button', { name: 'Start utsending', exact: true })).toBeFocused();
  expect(actions).toEqual(['save', 'preview', 'test']);
  await page.route('**/api/admin/newsletters*', (route) => {
    expect(route.request().postDataJSON().action).toBe('send');
    return route.fulfill({ status: 503, json: { message: 'Oppstart ikke bekreftet.', campaign: { ...campaign, status: 'failed', error_message: 'Oppstart ikke bekreftet.', total_count: 2 } } });
  });
  await section.getByRole('button', { name: 'Start utsending', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Bestill utsending' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(section.getByRole('alert')).toContainText('Oppstart ikke bekreftet.');
  await expect(section.getByRole('button', { name: 'Kontroller / gjenoppta jobb' })).toBeEnabled();
});

test('survey email panel keeps failed dispatch status and offers safe restart', async ({ page, context }) => {
  await authenticate(context);
  const overview = { configured: true, background_configured: true, bulk_enabled: true, survey: { can_send: true },
    groups: [{ id: '71', name: 'Syntetisk e-postgruppe', recipient_count: 2 }], selected_group_id: null,
    recipients: [{ id: '7001', name: 'Kari Kontakt', title_holder: 'Kari Hjemmelshaver', primary_contact_email: 'kari@example.invalid' },
      { id: '7002', name: 'Ola Kontakt', title_holder: 'Ola Hjemmelshaver', primary_contact_email: 'ola@example.invalid' }],
    recipient_count: 2, missing_email_count: 0, campaign: null, deliveries: [], page: 1, pages: 1 };
  await page.route(`**/api/admin/surveys/${surveyId}/email*`, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { ok: true, overview } });
    expect(route.request().postDataJSON()).toEqual({ action: 'send', groupId: '71', includeOtherEmails: false, singleResponsePerProperty: true, memberIds: [] });
    return route.fulfill({ status: 503, json: { ok: false, message: 'Bakgrunnsjobben kunne ikke startes.', campaign: { id: 'a'.repeat(32), status: 'failed', total_count: 2, sent_count: 0, failed_count: 0, suppressed_count: 0, delivered_count: 0, error_message: 'Oppstart ikke bekreftet.' } } });
  });
  await page.goto('/admin/browser-test');
  const section = page.getByRole('region', { name: 'Send undersøkelsen', exact: true });
  await section.getByRole('combobox', { name: 'E-postgruppe' }).click();
  await page.getByRole('option', { name: /Syntetisk/ }).click();
  await expect(section.getByRole('table', { name: /Mottakere i valgt/ })).toContainText('Kari Kontakt');
  await expect(section.getByRole('table', { name: /Mottakere i valgt/ })).toContainText('Kari Hjemmelshaver');
  await expect(section.getByRole('table', { name: /Mottakere i valgt/ })).toContainText('kari@example.invalid');
  await section.getByRole('button', { name: 'Start utsendelse', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start utsendelse' }).click();
  await expect(section.getByRole('alert').filter({ hasText: 'Oppstart ikke bekreftet' })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Start bakgrunnsjobben på nytt' })).toBeEnabled();
});

for (const status of ['pending', 'failed', 'completed']) {
  test(`survey email panel keeps the ${status} action visible when production configuration is missing`, async ({ page, context }) => {
    await authenticate(context);
    let configured = false;
    let posts = 0;
    await page.route(`**/api/admin/surveys/${surveyId}/email*`, (route) => {
      if (route.request().method() !== 'GET') { posts++; return route.abort(); }
      return route.fulfill({ json: { ok: true, overview: {
        configured: true, background_configured: configured, background_status: configured ? 'ready' : 'job_secret_missing',
        bulk_enabled: true, survey: { can_send: true }, groups: [{ id: '71', name: 'Syntetisk gruppe', recipient_count: 2 }],
        selected_group_id: '71', recipients: [], recipient_count: 2, missing_email_count: 0,
        campaign: { id: 'a'.repeat(32), status, group_name: 'Syntetisk gruppe', total_count: 2,
          sent_count: 0, failed_count: 0, suppressed_count: 0, delivered_count: 0 }, deliveries: [], page: 1, pages: 1,
      } } });
    });
    await page.goto('/admin/browser-test');
    const section = page.getByRole('region', { name: 'Send undersøkelsen', exact: true });
    const button = section.getByRole('button', { name: status === 'completed' ? 'Send nye sikre lenker' : 'Start bakgrunnsjobben på nytt' });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription(/MAILERSEND_JOB_SECRET/);
    configured = true;
    await page.reload();
    if (status === 'completed') {
      await section.getByRole('combobox', { name: 'E-postgruppe' }).click();
      await page.getByRole('option', { name: /Syntetisk gruppe/ }).click();
    }
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Avbryt' }).click();
    expect(posts).toBe(0);
  });
}

test('anonymous and wrong-role users cannot open member/map administration', async ({ page, context }) => {
  await page.goto('/admin/map');
  await expect(page).toHaveURL(/\/admin\/login/);
  expect((await context.request.post('/api/admin/map/search', { data: {} })).status()).toBe(401);
  await authenticate(context, ['TFV.CmsEditor']);
  expect((await context.request.post('/api/admin/map/search', { data: {} })).status()).toBe(403);
});

test('expired member access shows recovery and no member information', async ({ page }) => {
  await page.goto('/mine-opplysninger?status=invalid');
  await expect(page.getByRole('heading', { name: 'Tilgang kreves' })).toBeVisible();
  await expect(page.getByText('Lenken er ugyldig eller har utløpt.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gå til forsiden' })).toHaveAttribute('href', '/#medlemsopplysninger');
  await expect(page.getByRole('button', { name: 'Lagre kontaktopplysninger' })).toHaveCount(0);
});

test('survey validates all answers and recovers from version conflict', async ({ page }) => {
  await page.goto(`/survey?klm=${'1'.repeat(32)}&xyz=${surveyId}`);
  await expect(page.getByRole('heading', { name: 'Din vurdering' })).toBeVisible();
  const submit = page.getByRole('button', { name: /Send inn/ });
  await submit.click();
  await expect(page.getByText(/Svar på alle 4 spørsmål/)).toBeVisible();
  for (const radio of await page.getByRole('radio', { name: 'Ja', exact: true }).all()) { await radio.focus(); await radio.press('Space'); }
  await page.route('**/survey/api/responses', (route) => route.fulfill({ status: 409, json: { ok: false, code: 'SURVEY_CHANGED', message: 'Spørsmålene er endret. Last inn på nytt.' } }));
  await submit.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Spørsmålene er endret' })).toBeVisible();
  await page.getByRole('button', { name: 'Last inn undersøkelsen på nytt' }).click();
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(0);
});

test('synthetic member details close with Escape', async ({ page, context }) => {
  await authenticate(context);
  await page.goto('/admin/members');
  await expect(page.getByText('H-TEST-001', { exact: true }).first()).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'H-TEST-001' });
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Rediger medlem' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lukk' })).toHaveAttribute('title', /Lukk detaljpanelet/);
  await expect(page.getByText('Alle endringer lagret')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Rediger medlem' })).toHaveCount(0);
  await expect(row).toBeFocused();
});

test('map draws, edits and deletes a polygon without external services', async ({ page, context }) => {
  await authenticate(context);
  await page.goto('/admin/map');
  await page.locator('details.map-search-polygon > summary').click();
  await page.getByRole('button', { name: 'Tegn polygon', exact: true }).click();
  const map = page.locator('.leaflet-container');
  await expect(map).toBeVisible();
  const box = await map.boundingBox();
  for (const [x, y] of [[0.35, 0.35], [0.65, 0.35], [0.5, 0.65]]) await map.click({ position: { x: box.width * x, y: box.height * y } });
  await page.getByRole('button', { name: 'Fullfør polygon' }).click();
  await page.route('**/api/admin/map/search', (route) => {
    expect(route.request().postDataJSON().datatype).toBe('properties');
    return route.fulfill({ json: { complete: true, fetchedAt: '2026-09-15T12:00:00Z', warnings: [], boundaries: [{
      id: 'synthetic-teig', kind: 'boundary', name: '10/7001', references: [{ municipalityNumber: '3320', gnr: 10, bnr: 7001 }], source: 'Kartverket / Geonorge', accuracy: 'Gult', disputed: false, multipleProperties: false,
      feature: { type: 'Feature', properties: { source: 'Kartverket / Geonorge' }, geometry: { type: 'Polygon', coordinates: [[[9.494,60.464],[9.496,60.464],[9.495,60.466],[9.494,60.464]]] } },
    }] } });
  });
  await page.getByRole('button', { name: 'Hent eiendomsgrenser' }).click();
  await page.getByRole('button', { name: 'Teiger og grenser' }).click();
  await expect(page.getByRole('checkbox', { name: 'Eiendommer', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '10/7001', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Valgt kartobjekt' })).toContainText('ikke grensepåvisning');
  await expect(page.getByRole('button', { name: 'Rediger polygon' })).toBeVisible();
  await page.getByRole('button', { name: 'Rediger polygon' }).click();
  await page.getByText(/Koordinater og tilgjengelig polygonredigering/).click();
  await expect(page.getByRole('spinbutton', { name: 'Lengdegrad 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Slett polygon' }).click();
  await expect(page.getByRole('button', { name: 'Tegn polygon', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Fullfør polygon' })).toHaveCount(0);
});

test('hamlet polygons persist across reload, mark edited boundaries as drafts and preserve edits on conflicts', async ({ page, context }) => {
  await authenticate(context);
  let saved; let conflict = false; let mapMemberPatch;
  const writes = [];
  await page.route('**/api/admin/map/hamlets', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { hamlets: saved ? [saved] : [] } });
    const input = route.request().postDataJSON(); writes.push(input);
    if (conflict) return route.fulfill({ status: 409, json: { message: 'Grenden er endret av en annen administrator. Utkastet er beholdt.' } });
    saved = { id: '13', name: input.action === 'clear' ? saved.name : input.name,
      version: (saved?.version || 0) + 1, reviewed: input.action === 'clear' ? false : input.reviewed,
      polygon: input.action === 'clear' ? null : input.polygon, areaM2: 10000, source: 'Turufjell vel · syntetisk grendegrense' };
    return route.fulfill({ json: { hamlet: saved } });
  });
  await page.route('**/api/admin/map/search', (route) => {
    const datatype = route.request().postDataJSON().datatype;
    if (datatype === 'properties') return route.fulfill({ json: { complete: true, fetchedAt: '2026-09-15T12:00:00Z', warnings: [], boundaries: [] } });
    const address = { id: 'synthetic-address', kind: 'address', address: 'Testvegen 1', addressName: 'Testvegen', houseNumber: 1,
      gnr: 10, bnr: 7001, fnr: null, snr: null, postalCode: '3539', postalPlace: 'FLÅ', latitude: 60.465, longitude: 9.495, source: 'Kartverket',
      feature: { type: 'Feature', id: 'synthetic-address', properties: {}, geometry: { type: 'Point', coordinates: [9.495, 60.465] } } };
    const comparison = datatype === 'comparison' ? { officialCount: 1, registerCount: 1, registerScope: 'hamlet', counts: { MATCH: 1, MISSING_IN_REGISTER: 0, MISSING_IN_MAP_DATA: 0, POSSIBLE_MATCH: 0, CONFLICT: 0 }, unlocatedRows: [], rows: [{
      id: 'register:7001', status: 'MATCH', scope: 'address_in_polygon', notes: [], officialAddresses: [address],
      register: { id: '7001', hNumber: 'H-SYNTHETIC-1', address: 'Testvegen 1', gnr: 10, bnr: 7001, owners: [] },
    }] } : undefined;
    return route.fulfill({ json: { complete: true, fetchedAt: '2026-09-15T12:00:00Z', warnings: [], addresses: [address], comparison } });
  });
  await page.route('**/api/admin/members/7001', (route) => {
    if (route.request().method() === 'PATCH') mapMemberPatch = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, member: {
      id: '7001', h_number: 'H-SYNTHETIC-1', street_address: 'Testvegen 1', cadastral_number: '10/7001', section_number: null,
      title_holder: null, registration_date: null, primary_contact_name: mapMemberPatch?.primary_contact_name || 'Syntetisk kontakt', primary_contact_email: 'fixture@example.invalid',
      other_contact_emails: [], admin_comment: '', membership_status: 'member', hamlet_id: '13', hamlet_name: 'Slåtta Øst',
    } } });
  });
  await page.goto('/admin/map');
  const editor = page.getByRole('region', { name: 'Grender og lagrede polygoner' });
  const searchPolygonBox = await page.locator('details.map-search-polygon').boundingBox();
  const editorSectionBox = await editor.boundingBox();
  expect(searchPolygonBox.y).toBeLessThan(editorSectionBox.y);
  await expect(editor.locator('.map-explorer-canvas')).toBeVisible();
  const hamletSelectBox = await editor.getByLabel('Lagret grend').boundingBox();
  const newHamletButtonBox = await editor.getByRole('button', { name: 'Ny grend', exact: true }).boundingBox();
  expect(Math.abs(hamletSelectBox.y - newHamletButtonBox.y)).toBeLessThanOrEqual(1);
  const editorBox = await editor.locator('.map-hamlet-editor').boundingBox();
  const mapBox = await editor.locator('.map-hamlet-map').boundingBox();
  if (page.viewportSize().width > 820) expect(mapBox.x).toBeGreaterThan(editorBox.x + editorBox.width - 1);
  else expect(mapBox.y).toBeGreaterThan(editorBox.y);
  await expect(editor.getByRole('button', { name: 'Bruk grend i kartet' })).toHaveCount(0);
  await expect(editor.getByLabel('Navn på grend')).toHaveCount(0);
  await editor.getByRole('button', { name: 'Ny grend', exact: true }).click();
  await expect(editor.getByLabel('Navn på grend')).toBeVisible();
  await page.locator('details.map-search-polygon > summary').click();
  await page.getByRole('button', { name: 'Tegn polygon', exact: true }).click();
  const map = page.locator('.leaflet-container'); await expect(map).toBeVisible();
  const box = await map.boundingBox();
  for (const [x,y] of [[.35,.35],[.65,.35],[.5,.65]]) await map.click({ position: { x: box.width*x, y: box.height*y } });
  await page.getByRole('button', { name: 'Fullfør polygon' }).click();
  await editor.getByLabel('Navn på grend').fill('Slåtta Øst');
  await editor.getByRole('checkbox').check();
  await editor.getByRole('button', { name: 'Lagre polygon som ny grend' }).click();
  await expect(editor.getByRole('status')).toContainText('lagret i databasen');
  expect(writes[0].action).toBe('create'); expect(writes[0].reviewed).toBe(true);
  expect(writes[0].polygon.geometry.type).toBe('Polygon');
  await page.reload();
  await editor.locator('.leaflet-overlay-pane path').first().click({ force: true });
  await expect(editor.getByRole('combobox', { name: 'Lagret grend' })).toContainText('Slåtta Øst');
  await page.getByRole('button', { name: 'Testvegen 1', exact: true }).first().click();
  const memberPanel = page.getByRole('complementary', { name: 'Medlemsdetaljer fra kartet' });
  await expect(memberPanel.getByRole('heading', { name: 'H-SYNTHETIC-1' })).toBeVisible();
  await expect(memberPanel).toContainText('Ingen hjemmelshaver er funnet i medlemsregisteret');
  await memberPanel.getByLabel('Kontaktperson').fill('Oppdatert fra kart');
  await expect.poll(() => mapMemberPatch?.primary_contact_name).toBe('Oppdatert fra kart');
  await expect(memberPanel.getByText('Alle endringer lagret')).toBeVisible();
  await memberPanel.getByRole('button', { name: 'Lukk', exact: true }).click();
  await page.locator('details.map-search-polygon > summary').click();
  await expect(editor.getByLabel('Navn på grend')).toHaveValue('Slåtta Øst');
  await expect(editor.getByRole('checkbox')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Hent adresser', exact: true })).toBeEnabled();
  await expect(page.getByText('Registrerte tomter i valgt grend')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Koble register til valgt grend' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Grendegrenser', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Grendegrenser', exact: true }).check();
  await page.getByRole('button', { name: 'Rediger polygon', exact: true }).click();
  await page.getByText(/Koordinater og tilgjengelig polygonredigering/).click();
  const longitude = page.getByRole('spinbutton', { name: 'Lengdegrad 1', exact: true });
  await longitude.fill(String(Number(await longitude.inputValue()) + .0001));
  await page.getByRole('button', { name: 'Fullfør polygon' }).click();
  await expect(editor.getByRole('checkbox')).not.toBeChecked();
  await editor.getByLabel('Navn på grend').fill('Slåtta Øst endret');
  conflict = true;
  await editor.getByRole('button', { name: 'Lagre grendeendringer' }).click();
  await expect(editor.getByRole('alert')).toContainText('Utkastet er beholdt');
  await expect(editor.getByLabel('Navn på grend')).toHaveValue('Slåtta Øst endret');
  await editor.getByRole('button', { name: 'Last grendelisten på nytt' }).click();
  await expect(editor.getByLabel('Navn på grend')).toHaveValue('Slåtta Øst endret');
  await expect(editor.getByRole('button', { name: 'Lagre grendeendringer' })).toBeEnabled();
  conflict = false;
  await editor.getByRole('button', { name: 'Lagre grendeendringer' }).click();
  await expect(editor.getByRole('status')).toContainText('lagret i databasen');
  expect(writes.at(-1).reviewed).toBe(false); expect(writes.at(-1).version).toBe(1);
  page.once('dialog', (dialog) => dialog.accept());
  await editor.getByRole('button', { name: 'Fjern lagret polygon' }).click();
  await expect(editor.getByRole('status')).toContainText('Grenden og medlemskoblingene er beholdt');
  await expect(editor.getByRole('combobox', { name: 'Lagret grend' })).toContainText('Slåtta Øst endret · uten polygon');
  expect(writes.at(-1).action).toBe('clear');
  const layout = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
});

test('member entry validates input and displays rate-limit recovery without disclosing register matches', async ({ page }) => {
  await page.goto('/#medlemsopplysninger');
  const input = page.getByLabel('H-nummer, gateadresse eller e-postadresse');
  await page.getByRole('button', { name: 'Send sikker lenke' }).click();
  await expect(input).toBeFocused();
  await input.fill('H-TEST-001');
  await page.route('**/api/member-access/request', (route) => route.fulfill({ status: 429, json: { ok: false, message: 'For mange forespørsler. Vent litt og prøv igjen.' } }));
  await page.getByRole('button', { name: 'Send sikker lenke' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'For mange forespørsler' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send sikker lenke' })).toBeEnabled();
});

test('CMS editor supports keyboard formatting, persists structured content and reports save failures', async ({ page, context }) => {
  await authenticate(context);
  await page.goto('/admin/web');
  await page.getByRole('button', { name: /Ny side|Opprett side/ }).first().click();
  const panel = page.getByRole('complementary', { name: 'Rediger nettside' });
  await panel.getByRole('textbox', { name: /^Tittel/ }).fill('Syntetisk artikkel');
  const editor = panel.getByRole('textbox', { name: 'Hovedtekst', exact: true });
  await expect(editor).toBeVisible();
  await editor.fill('Trygg artikkeltekst');
  await editor.press('ControlOrMeta+a');
  await panel.getByRole('button', { name: 'Fet', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Trygg artikkeltekst');
  let payload;
  await page.route('**/api/admin/cms/pages', (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 503, json: { ok: false, message: 'Kunne ikke lagre siden. Prøv igjen senere.' } });
  });
  await panel.getByRole('button', { name: /Lagre utkast/ }).click();
  await expect(panel.getByText('Kunne ikke lagre siden. Prøv igjen senere.')).toBeVisible();
  expect(payload.bodyRichText.content[0].content[0].marks).toContainEqual({ type: 'bold' });
  await expect(editor).toHaveAttribute('contenteditable', 'true');
});

test('group creation, selection, counts and safe deletion are wired to the protected API', async ({ page, context }) => {
  await authenticate(context);
  const group = { id: '12', name: 'Syntetisk grend', kind: 'hamlet', plot_count: 2, member_count: 2, email_count: 1 };
  const calls = [];
  await page.route('**/api/admin/member-groups', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { groups: [group] } });
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, group: calls.at(-1).action === 'create' ? group : { changed_count: 2 } } });
  });
  await page.goto('/admin/members/groups');
  await page.getByLabel('Navn', { exact: true }).fill(group.name);
  await page.getByRole('button', { name: 'Opprett', exact: true }).click();
  await expect(page.getByRole('heading', { name: group.name })).toBeVisible();
  await page.getByRole('searchbox').fill('Test');
  await page.getByLabel(/Velg alle .* treff/).check();
  await page.getByRole('button', { name: 'Legg til / flytt valgte' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 tomter behandlet' })).toBeVisible();
  expect(calls.at(-1).allMatching).toBe(true);
  await page.getByRole('button', { name: 'Slett grupperingen' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Ingen medlemsdata slettes');
  await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
  expect(calls.some((call) => call.action === 'delete')).toBe(false);
});

test('map discards late results after edit and cancel', async ({ page, context }) => {
  await authenticate(context);
  await page.goto('/admin/map');
  await page.locator('details.map-search-polygon > summary').click();
  await page.getByRole('button', { name: 'Tegn polygon', exact: true }).click();
  const map = page.locator('.leaflet-container');
  const box = await map.boundingBox();
  for (const [x, y] of [[0.35, 0.35], [0.65, 0.35], [0.5, 0.65]]) await map.click({ position: { x: box.width * x, y: box.height * y } });
  await page.getByRole('button', { name: 'Fullfør polygon' }).click();
  const pending = [];
  await page.route('**/api/admin/map/search', (route) => { pending.push(route); });
  await page.getByRole('button', { name: 'Hent adresser' }).click();
  await expect(page.getByText('Henter og behandler data …')).toBeVisible();
  await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
  await expect(page.getByText('Forespørselen er avbrutt.')).toBeVisible();
  await page.getByRole('button', { name: 'Hent adresser' }).click();
  await expect.poll(() => pending.length).toBe(2);
  await page.getByRole('button', { name: 'Rediger polygon' }).click();
  const result = { complete: true, addresses: [{ id: 'test-point', addressName: 'Testvegen', houseNumber: 2, houseLetter: null, latitude: 60.442, longitude: 9.47, source: 'Kartverket', gnr: 10, bnr: 1 }], warnings: [] };
  for (const route of pending) await route.fulfill({ json: result }).catch(() => {});
  await page.getByRole('button', { name: 'Fullfør polygon', exact: true }).click();
  await page.unroute('**/api/admin/map/search');
  await page.route('**/api/admin/map/search', (route) => route.fulfill({ json: result }));
  await page.getByRole('button', { name: 'Hent adresser' }).click();
  await expect(page.getByText('1 offisielle adresser hentet.')).toBeVisible();
});

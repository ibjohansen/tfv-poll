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

test('profile keeps property scope, renders comments as text and preserves edits on expired session', async ({ page, context }) => {
  await authenticate(context); await page.goto('/admin/browser-test');
  await expect(page.getByRole('navigation', { name: 'Dine tomter' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Last ned som JSON' })).toHaveAttribute('href', '/api/member-access/export?member=7001');
  await expect(page.getByText('<img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
  await expect(page.locator('.member-comment-text img')).toHaveCount(0);
  const contact = page.getByRole('region', { name: 'Kontaktopplysninger', exact: true });
  await contact.getByLabel('Kontaktperson', { exact: true }).fill('Ny syntetisk kontakt');
  await contact.getByLabel('Kommentar til endringen (valgfritt)').fill('En syntetisk retting');
  let payload;
  await page.route('**/api/member-access/profile', async (route) => { payload = route.request().postDataJSON(); await route.fulfill({ status: 401, json: { ok: false, message: 'Økten er utløpt. Be om ny lenke.' } }); });
  await contact.getByRole('button', { name: 'Lagre kontaktopplysninger' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Økten er utløpt' })).toBeVisible();
  expect(payload.memberId).toBe('7001'); expect(payload.comment).toBe('En syntetisk retting');
  await expect(contact.getByLabel('Kontaktperson', { exact: true })).toHaveValue('Ny syntetisk kontakt');
  await page.route('**/api/member-access/profile', (route) => route.fulfill({ json: { ok: true, message: 'Kontaktopplysningene er lagret.', member: { primary_contact_name: 'Ny syntetisk kontakt' } } }));
  await contact.getByRole('button', { name: 'Lagre kontaktopplysninger' }).click();
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
  await audit.getByRole('button', { name: 'Filtrer' }).click();
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
  const overview = { configured: true, bulk_enabled: true, survey: { can_send: true }, recipient_count: 2, missing_email_count: 0, campaign: null, deliveries: [], page: 1, pages: 1 };
  await page.route(`**/api/admin/surveys/${surveyId}/email*`, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { ok: true, overview } });
    expect(route.request().postDataJSON().action).toBe('send');
    return route.fulfill({ status: 503, json: { ok: false, message: 'Bakgrunnsjobben kunne ikke startes.', campaign: { id: 'a'.repeat(32), status: 'failed', total_count: 2, sent_count: 0, failed_count: 0, suppressed_count: 0, delivered_count: 0, error_message: 'Oppstart ikke bekreftet.' } } });
  });
  await page.goto('/admin/browser-test');
  const section = page.getByRole('region', { name: 'Send undersøkelsen', exact: true });
  await section.getByRole('button', { name: 'Start utsendelse', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start utsendelse' }).click();
  await expect(section.getByRole('alert').filter({ hasText: 'Oppstart ikke bekreftet' })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Start bakgrunnsjobben på nytt' })).toBeEnabled();
});

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
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Rediger medlem' })).toHaveCount(0);
  await expect(row).toBeFocused();
});

test('map draws, edits and deletes a polygon without external services', async ({ page, context }) => {
  await authenticate(context);
  await page.goto('/admin/map');
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
  await expect(page.getByRole('checkbox', { name: 'Eiendomsgrenser', exact: true })).toBeChecked();
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
  await page.getByRole('button', { name: 'Finn tomter' }).click();
  await page.getByLabel(/Velg alle .* treff/).check();
  await page.getByRole('button', { name: 'Legg til / flytt valgte' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 tomter behandlet' })).toBeVisible();
  expect(calls.at(-1).allMatching).toBe(true);
  await page.getByRole('button', { name: 'Slett grupperingen' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Ingen medlemsdata slettes');
  await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
  expect(calls.some((call) => call.action === 'delete')).toBe(false);
});

test('map discards late results after edit/cancel and exports the accepted polygon', async ({ page, context }) => {
  await authenticate(context);
  await page.goto('/admin/map');
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
  await expect(page.getByRole('button', { name: 'Adresse-CSV' })).toBeDisabled();
  await page.getByRole('button', { name: /Fullfør polygon|Lagre polygon/ }).click();
  await page.unroute('**/api/admin/map/search');
  await page.route('**/api/admin/map/search', (route) => route.fulfill({ json: result }));
  await page.getByRole('button', { name: 'Hent adresser' }).click();
  await expect(page.getByRole('button', { name: 'Adresse-CSV' })).toBeEnabled();
  let payload;
  await page.route('**/api/admin/map/export', (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({ body: 'Adresse\nTestvegen 2', headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="synthetic-addresses.csv"' } });
  });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Adresse-CSV' }).click();
  expect((await downloaded).suggestedFilename()).toBe('synthetic-addresses.csv');
  expect(payload.format).toBe('addresses-csv');
  expect(payload.polygon.geometry.type).toBe('Polygon');
});

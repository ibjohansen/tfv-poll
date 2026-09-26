import { test, expect } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import axe from 'axe-core';
import { testAdmin, testAuthSecret, testOrigin, testTenant } from './environment.mjs';
import { surveyId } from '../../data/survey.js';
import { summarizeSurveyResponses } from '../../lib/survey-results.js';

const hamlets = [{ id: '1', name: 'Grend A' }, { id: '2', name: 'Grend B' }, { id: '3', name: 'Tom grend' }];
const questions = [{ id: 'q1', number: 1, text: 'Et syntetisk spørsmål?' }];
const responses = [{ hamlet: '1', answer: 'ja' }, { hamlet: '1', answer: 'nei' }, { hamlet: '2', answer: 'ja' }, { hamlet: 'none', answer: 'usikker' }];
function result(hamlet) {
  return { ...summarizeSurveyResponses({ id: surveyId, title: 'Test', question_version: 1, questions },
    responses.filter((entry) => !hamlet || entry.hamlet === hamlet).map((entry) => ({ question_version: 1, questions, answers: { q1: entry.answer } }))),
  hamlets, hamlet_id: hamlet };
}
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => new URL(route.request().url()).origin === testOrigin ? route.continue() : route.abort());
  const name = 'authjs.session-token';
  const value = await encode({ secret: testAuthSecret, salt: name, maxAge: 3600,
    token: { sub: 'synthetic-survey-admin', email: testAdmin, tenantId: testTenant, roles: ['TFV.SurveyAdmin'] } });
  await context.addCookies([{ name, value, url: testOrigin, httpOnly: true, sameSite: 'Lax' }]);
});
async function openResults(page) {
  await page.goto('/admin/surveys');
  await page.getByRole('row', { name: /Medlemsundersøkelse om Kristnatten/ }).click();
  await page.getByRole('tab', { name: /Resultater/ }).click();
  await expect(page.locator('#survey-results-heading')).toContainText('4');
}
async function selectHamlet(page, name) {
  await page.getByRole('combobox', { name: 'Grend', exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}

test('survey hamlet filter updates charts, response counts and Excel links with keyboard and mobile access', async ({ page }, testInfo) => {
  await page.route(/\/api\/admin\/surveys\/[^/]+\/results(?:\?|$)/, (route) =>
    route.fulfill({ json: { ok: true, results: result(new URL(route.request().url()).searchParams.get('hamlet') || '') } }));
  await openResults(page);
  const filter = page.getByRole('combobox', { name: 'Grend', exact: true });
  await filter.focus(); await filter.press('Enter'); await filter.press('ArrowDown'); await filter.press('Enter');
  await expect(filter).toBeFocused();
  await expect(filter).toHaveText('Grend A');
  await expect(page.locator('#survey-results-heading')).toContainText('2');
  await expect(page.locator('.survey-donut')).toHaveAttribute('aria-label', /50/);
  await expect(page.locator('.survey-results-export')).toHaveAttribute('href', `/api/admin/surveys/${surveyId}/results/export?hamlet=1`);
  await selectHamlet(page, 'Grend B');
  await expect(page.locator('#survey-results-heading')).toContainText('1');
  await expect(page.locator('.survey-donut')).toHaveAttribute('aria-label', /100/);
  await selectHamlet(page, 'Tom grend');
  await expect(page.locator('.survey-results-empty')).toBeVisible();
  await expect(filter).toBeVisible();
  await selectHamlet(page, 'Uten grend');
  await expect(page.locator('#survey-results-heading')).toContainText('1');
  await expect(page.locator('.survey-results-export')).toHaveAttribute('href', /hamlet=none$/);
  await selectHamlet(page, 'Alle grender');
  await expect(page.locator('#survey-results-heading')).toContainText('4');
  await expect(page.locator('.survey-results-export')).toHaveAttribute('href', `/api/admin/surveys/${surveyId}/results/export`);
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.addScriptTag({ content: axe.source });
  const accessibility = await page.evaluate(() => window.axe.run('.survey-results-view', { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] }));
  expect(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  await page.locator('.survey-results-view').screenshot({ path: testInfo.outputPath('survey-grend.png') });
});

test('survey hamlet filter remains usable during slow requests and errors, and ignores stale results', async ({ page }) => {
  let slowRoute, fail = false;
  await page.route(/\/api\/admin\/surveys\/[^/]+\/results(?:\?|$)/, (route) => {
    const hamlet = new URL(route.request().url()).searchParams.get('hamlet') || '';
    if (hamlet === '1') { slowRoute = route; return; }
    return route.fulfill(fail ? { status: 503, json: { ok: false } } : { json: { ok: true, results: result(hamlet) } });
  });
  await openResults(page);
  await selectHamlet(page, 'Grend A');
  await expect(page.locator('.survey-results-status')).toBeVisible();
  await expect(page.locator('.survey-results-export')).toHaveCount(0);
  await expect.poll(() => Boolean(slowRoute)).toBe(true);
  await selectHamlet(page, 'Grend B');
  await expect(page.locator('#survey-results-heading')).toContainText('1');
  await slowRoute.fulfill({ json: { ok: true, results: result('1') } });
  await expect(page.getByRole('combobox', { name: 'Grend', exact: true })).toHaveText('Grend B');
  await expect(page.locator('#survey-results-heading')).toContainText('1');
  fail = true;
  await selectHamlet(page, 'Uten grend');
  await expect(page.locator('.survey-results-view').getByRole('alert')).toContainText('Kunne ikke hente resultatene');
  await expect(page.locator('.survey-results-export')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Prøv igjen' }).click();
  await expect(page.locator('#survey-results-heading')).toContainText('1');
  await page.getByRole('button', { name: 'Lukk', exact: true }).click();
  await openResults(page);
  await expect(page.getByRole('combobox', { name: 'Grend', exact: true })).toHaveText('Alle grender');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCmsContent, validateCmsPublication } from '../lib/cms-quality.js';

test('CMS quality checks distinguish blocking errors from overridable warnings', () => {
  const page = {
    title: 'En svært lang tittel som med hensikt er lengre enn sytti tegn for kvalitetskontroll',
    intro: '', image: { id: 'image' }, imageAlt: '', imageDecorative: false,
    bodyRichText: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Les mer', marks: [{ type: 'link', attrs: { href: '/sak' } }] }] }] },
  };
  const findings = analyzeCmsContent(page);
  assert.ok(findings.some(({ code, severity }) => code === 'missingImageAlt' && severity === 'error'));
  assert.ok(findings.some(({ code, severity }) => code === 'missingIntro' && severity === 'warning'));
  assert.equal(validateCmsPublication(page, [], 'god redaksjonell grunn').valid, false, 'errors can never be overridden');
  page.imageDecorative = true;
  assert.equal(validateCmsPublication(page, [], '').valid, false, 'warnings need a reason');
  assert.equal(validateCmsPublication(page, [], 'god redaksjonell grunn').valid, true);
});

test('CMS quality checks accept a concise accessible article without an override', () => {
  const result = validateCmsPublication({ title: 'Trygg informasjon', intro: 'Kort ingress.', body: 'Nyttig hovedtekst.' }, [], '');
  assert.equal(result.valid, true);
  assert.deepEqual(result.findings, []);
});

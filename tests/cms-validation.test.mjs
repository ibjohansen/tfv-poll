import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlug, isPublicCmsPath, isValidCmsSlug, normalizeSlugInput, validateCmsPageInput } from '../lib/cms-validation.js';

test('creates stable Norwegian URL slugs without formatting syntax', () => {
  assert.equal(createSlug(' Årsmøte på Turufjell – 2026! '), 'arsmote-pa-turufjell-2026');
  assert.equal(createSlug('Hytter & løypetråkk'), 'hytter-loypetrakk');
  assert.equal(normalizeSlugInput('Årsmøte-'), 'arsmote-');
});

test('reserves application routes and only accepts one public URL segment', () => {
  for (const slug of ['admin', 'api', 'survey', '_next', 'Stor-Side', 'med rom']) assert.equal(isValidCmsSlug(slug), false, slug);
  assert.equal(isValidCmsSlug('nyttig-info-2026'), true);
  assert.equal(isPublicCmsPath('/nyttig-info-2026'), true);
  assert.equal(isPublicCmsPath('/nyttig-info-2026/mer'), false);
  assert.equal(isPublicCmsPath('/fil.pdf'), false);
});

test('validates the structured page model and field limits', () => {
  const page = {
    title: 'Nyttig informasjon',
    slug: 'nyttig-informasjon',
    intro: 'Kort ingress',
    body: 'Vanlig tekst\nmed linjeskift.',
    imageAlt: '',
    imageCaption: '',
    category: 'Nyttig info',
    status: 'draft',
  };
  assert.equal(validateCmsPageInput(page), true);
  assert.equal(validateCmsPageInput({ ...page, title: '' }), false);
  assert.equal(validateCmsPageInput({ ...page, title: 'x'.repeat(121) }), false);
  assert.equal(validateCmsPageInput({ ...page, intro: 'x'.repeat(501) }), false);
  assert.equal(validateCmsPageInput({ ...page, status: 'archived' }), false);
});

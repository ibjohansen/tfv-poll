import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCALE, formatLocale, localeFromAcceptLanguage, normalizeLocale } from '../lib/i18n/config.js';
import { getRequestLocale } from '../lib/i18n/request.js';
import { dictionaries, getDictionary } from '../locales/index.js';
import { scopedTranslator, translate } from '../lib/i18n/translate.js';
import { loadModule, request } from './helpers/load-module.mjs';

function keys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child) ? keys(child, path) : [path];
  }).sort();
}

test('supported locales are normalized and unsupported locales fall back to Norwegian', () => {
  assert.equal(normalizeLocale('nb-NO'), 'nb');
  assert.equal(normalizeLocale('EN_gb'), 'en');
  assert.equal(normalizeLocale('de'), null);
  assert.equal(getDictionary('de'), dictionaries[DEFAULT_LOCALE]);
  assert.equal(formatLocale('en'), 'en-GB');
});

test('Accept-Language honours quality and request cookies take precedence', () => {
  assert.equal(localeFromAcceptLanguage('nb-NO;q=0.6,en-GB;q=0.9'), 'en');
  assert.equal(localeFromAcceptLanguage('de-DE,en;q=0'), DEFAULT_LOCALE);
  const request = { headers: new Headers({ cookie: 'other=x; tfv_locale=en', 'accept-language': 'nb-NO' }) };
  assert.equal(getRequestLocale(request), 'en');
});

test('translation supports scopes, interpolation and explicit fallback values', () => {
  assert.equal(translate(dictionaries.en, 'map.public.summary', { count: 2, name: 'Turusvingen' }), '2 registered properties in Turusvingen.');
  const t = scopedTranslator(dictionaries.en, 'general.navigation');
  assert.equal(t('login'), 'Sign in');
  assert.equal(t('missing', {}, 'Fallback'), 'Fallback');
});

test('Norwegian and English dictionaries have identical non-empty message keys', () => {
  assert.deepEqual(keys(dictionaries.en), keys(dictionaries.nb));
  for (const locale of Object.values(dictionaries)) {
    for (const key of keys(locale)) assert.notEqual(translate(locale, key), '', key);
  }
});

test('locale endpoint stores only supported same-origin locale values', async () => {
  const route = await loadModule('app/api/locale/route.js', {
    '@/lib/i18n/config': { LOCALE_COOKIE: 'tfv_locale', normalizeLocale },
  });
  const valid = await route.POST(request('/api/locale', { method: 'POST', body: { locale: 'en' } }));
  assert.equal(valid.status, 204);
  assert.match(valid.headers.get('set-cookie'), /tfv_locale=en/);
  assert.match(valid.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(valid.headers.get('set-cookie'), /SameSite=lax/i);
  for (const options of [
    { body: { locale: 'de' } },
    { body: { locale: 'en', extra: true } },
    { body: { locale: 'en' }, headers: { origin: 'https://evil.test' } },
    { rawBody: '{', headers: { 'Content-Type': 'application/json' } },
  ]) {
    const response = await route.POST(request('/api/locale', { method: 'POST', ...options }));
    assert.ok([400, 403].includes(response.status));
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

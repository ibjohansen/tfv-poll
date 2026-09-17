import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server.js';
import { apiErrorStatus, readJsonObject } from '../../lib/api-errors.js';
import { getRequestI18n } from '../../lib/i18n/request.js';
import { LOCALE_COOKIE, normalizeLocale } from '../../lib/i18n/config.js';
import { getApplicationOrigin, isSameOriginRequest } from '../../lib/request-origin.js';

// Execute the actual source with explicit dependencies. Never fall back to a
// real database, mail provider, auth provider or network from a route test.
export async function loadModule(path, dependencies = {}, globals = {}) {
  const url = new URL(`../../${path}`, import.meta.url);
  const context = createContext({
    URL, URLSearchParams, Request, Response, Headers, FormData, File, Blob,
    Buffer, Uint8Array, Date, Error, TypeError, JSON, AbortSignal, AbortController, setTimeout, clearTimeout,
    process: { env: { NODE_ENV: 'test' } },
    console: { error() {}, info() {}, warn() {} },
    fetch: () => { throw new Error('Unexpected network access in test'); },
    ...globals,
  });
  const imports = {
    'server-only': {}, 'next/server': { NextResponse }, '@/lib/api-errors': { apiErrorStatus, readJsonObject },
    '@/lib/i18n/request': { getRequestI18n }, './lib/i18n/request': { getRequestI18n },
    '@/lib/request-origin': { getApplicationOrigin, isSameOriginRequest },
    '../../lib/request-origin.js': { getApplicationOrigin, isSameOriginRequest },
    './lib/i18n/config': { LOCALE_COOKIE, normalizeLocale }, ...dependencies,
  };
  const mocks = new Map();
  function dependency(specifier) {
    if (mocks.has(specifier)) return mocks.get(specifier);
    if (!Object.hasOwn(imports, specifier)) throw new Error(`Unmocked dependency: ${specifier} in ${path}`);
    const exports = imports[specifier];
    const mockModule = new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
    mocks.set(specifier, mockModule);
    return mockModule;
  }
  const sourceModule = new SourceTextModule(await readFile(url, 'utf8'), { identifier: url.href, context,
    importModuleDynamically: async (specifier) => {
      const mockModule = dependency(specifier);
      if (mockModule.status === 'unlinked') await mockModule.link(() => { throw new Error('Unexpected nested test dependency'); });
      if (mockModule.status === 'linked') await mockModule.evaluate();
      return mockModule;
    },
  });
  await sourceModule.link(dependency);
  await sourceModule.evaluate();
  return sourceModule.namespace;
}

export function request(path, { method = 'GET', body, headers = {}, rawBody } = {}) {
  return new NextRequest(new URL(path, 'https://example.test'), {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(rawBody !== undefined ? { body: rawBody } : body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function routeContext(values = {}) {
  return { params: Promise.resolve({ id: 'a'.repeat(32), memberId: '7', attachmentId: 'b'.repeat(32), slug: 'testside', ...values }) };
}

export function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server.js';
import { apiErrorStatus, readJsonObject } from '../../lib/api-errors.js';

// Execute the actual source with explicit dependencies. Never fall back to a
// real database, mail provider, auth provider or network from a route test.
export async function loadModule(path, dependencies = {}, globals = {}) {
  const url = new URL(`../../${path}`, import.meta.url);
  const context = createContext({
    URL, URLSearchParams, Request, Response, Headers, FormData, File, Blob,
    Buffer, Uint8Array, Date, Error, TypeError, JSON, setTimeout, clearTimeout,
    process: { env: { NODE_ENV: 'test' } },
    console: { error() {}, info() {}, warn() {} },
    fetch: () => { throw new Error('Unexpected network access in test'); },
    ...globals,
  });
  const sourceModule = new SourceTextModule(await readFile(url, 'utf8'), { identifier: url.href, context });
  const imports = { 'server-only': {}, 'next/server': { NextResponse }, '@/lib/api-errors': { apiErrorStatus, readJsonObject }, ...dependencies };
  await sourceModule.link((specifier) => {
    if (!Object.hasOwn(imports, specifier)) throw new Error(`Unmocked dependency: ${specifier} in ${path}`);
    const exports = imports[specifier];
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
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

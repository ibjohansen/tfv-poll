import test from 'node:test';
import assert from 'node:assert/strict';
import { isCmsStorageConfigured } from '../lib/cms-storage.js';

const storageVariables = [
  'NEON_STORAGE_ACCESS_KEY_ID',
  'NEON_STORAGE_SECRET_ACCESS_KEY',
  'NEON_STORAGE_ENDPOINT',
  'NEON_STORAGE_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ENDPOINT_URL_S3',
  'AWS_REGION',
];

function clearStorageVariables() {
  for (const variable of storageVariables) delete process.env[variable];
}

test('accepts complete Netlify aliases or complete Neon AWS variables', () => {
  const previous = Object.fromEntries(storageVariables.map((variable) => [variable, process.env[variable]]));

  try {
    clearStorageVariables();
    assert.equal(isCmsStorageConfigured(), false);

    process.env.NEON_STORAGE_ACCESS_KEY_ID = 'access-key';
    process.env.NEON_STORAGE_SECRET_ACCESS_KEY = 'secret-key';
    process.env.NEON_STORAGE_ENDPOINT = 'https://storage.example.test';
    process.env.NEON_STORAGE_REGION = 'eu-central-1';
    assert.equal(isCmsStorageConfigured(), true);

    clearStorageVariables();
    process.env.AWS_ACCESS_KEY_ID = 'access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret-key';
    process.env.AWS_ENDPOINT_URL_S3 = 'https://storage.example.test';
    process.env.AWS_REGION = 'eu-central-1';
    assert.equal(isCmsStorageConfigured(), true);

    process.env.NEON_STORAGE_ACCESS_KEY_ID = 'incomplete-netlify-configuration';
    assert.equal(isCmsStorageConfigured(), false);

    delete process.env.NEON_STORAGE_ACCESS_KEY_ID;
    delete process.env.AWS_ENDPOINT_URL_S3;
    assert.equal(isCmsStorageConfigured(), false);
  } finally {
    clearStorageVariables();
    for (const [variable, value] of Object.entries(previous)) {
      if (value !== undefined) process.env[variable] = value;
    }
  }
});

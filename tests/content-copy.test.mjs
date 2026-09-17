import test from 'node:test';
import assert from 'node:assert/strict';
import { copyContentFiles } from '../lib/content-copy.js';

test('copies use independent object keys and preserve file metadata', async () => {
  const uploads = [];
  const files = [{ storage_key: 'original/file', title: 'Test', mime_type: 'application/pdf', size_bytes: 4 }];
  const storage = { downloadCmsObject: async () => ({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3, 4]) } }),
    uploadCmsObject: async (...args) => uploads.push(args), deleteCmsObject: async () => { throw new Error('Unexpected delete'); } };
  const result = await copyContentFiles(files, 'surveys/new/attachments', async (copied) => copied, storage);
  assert.match(result[0].id, /^[a-f0-9]{32}$/);
  assert.notEqual(result[0].storage_key, files[0].storage_key);
  assert.equal(result[0].title, 'Test');
  assert.equal(uploads[0][2], 'application/pdf');
});

test('failed copy cleans up only newly created objects and does not mutate originals', async () => {
  const removed = [];
  const storage = { downloadCmsObject: async () => ({ Body: { transformToByteArray: async () => new Uint8Array([1]) } }),
    uploadCmsObject: async () => { throw new Error('Upload unavailable'); }, deleteCmsObject: async (key) => removed.push(key) };
  await assert.rejects(copyContentFiles([{ storage_key: 'original/file' }], 'copy/new', async () => assert.fail('Unexpected persist'), storage));
  assert.equal(removed.length, 1);
  assert.match(removed[0], /^copy\/new\//);
  assert.notEqual(removed[0], 'original/file');
});

test('unknown database commit outcome cannot delete files possibly referenced by the new draft', async () => {
  const storage = { downloadCmsObject: async () => ({ Body: { transformToByteArray: async () => new Uint8Array([1]) } }),
    uploadCmsObject: async () => {}, deleteCmsObject: async () => assert.fail('Unsafe cleanup after possible COMMIT') };
  await assert.rejects(copyContentFiles([{ storage_key: 'original/file' }], 'copy/new', async () => { throw new Error('Database connection lost'); }, storage));
});

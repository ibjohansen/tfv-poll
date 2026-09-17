import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFileTitle, validateUploadedFile } from '../lib/upload-validation.js';

test('survey and CMS uploads accept verified document signatures and safe filenames', async () => {
  const file = new File([Buffer.from('%PDF-1.7\nsynthetic')], '../Bakgrunnsdokument.pdf', { type: 'application/octet-stream' });
  const result = await validateUploadedFile(file);
  assert.equal(result.filename, 'Bakgrunnsdokument.pdf');
  assert.equal(result.mimeType, 'application/pdf');
  assert.equal(result.extension, 'pdf');
  assert.equal(defaultFileTitle(result.filename), 'Bakgrunnsdokument');
});

test('uploads reject unsupported extensions, spoofed content and images used as CMS hero files', async () => {
  await assert.rejects(validateUploadedFile(new File(['text'], 'private.txt')), /Invalid file/);
  await assert.rejects(validateUploadedFile(new File(['not a pdf'], 'fake.pdf')), /Invalid file/);
  await assert.rejects(validateUploadedFile(new File([Buffer.from('%PDF-1.7')], 'document.pdf'), 'image'), /Invalid image/);
});

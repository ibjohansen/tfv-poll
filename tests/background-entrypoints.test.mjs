import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('all background entrypoints load in bare Node without Next, Auth or production credentials', () => {
  const files = ['matrikkel-sync-background', 'survey-email-background', 'newsletter-background', 'background-watchdog'];
  const code = `for (const name of ${JSON.stringify(files)}) { const module = await import('./netlify/functions/' + name + '.mjs'); if (typeof module.default !== 'function') throw new Error('Missing handler: ' + name); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), env: { NODE_ENV: 'test', MOCK_DATA: 'true' }, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
});

import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { testAdmin, testAuthSecret, testOrigin, testTenant } from './environment.mjs';

// Real application copy, no .env files, production data, DB connections,
// provider credentials, or authentication bypasses in application code.
const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'tfv-browser-tests-'));
const entries = ['app', 'components', 'lib', 'locales', 'data', 'public', 'auth.js', 'proxy.js',
  'package.json', 'package-lock.json', 'jsconfig.json', 'next.config.mjs', 'postcss.config.mjs', 'tailwind.config.js'];
await Promise.all(entries.map((entry) => cp(join(root, entry), join(directory, entry), { recursive: true })));
// Stable small fixtures, independent of user uploads and ongoing file renames.
// Only the disposable copy is replaced; original images are never changed.
await rm(join(directory, 'public/carousel'), { recursive: true });
await mkdir(join(directory, 'public/carousel'));
await cp(join(root, 'public/turufjell.jpeg'), join(directory, 'public/carousel/Ø Testfotograf_tf001.jpg'));
await cp(join(root, 'public/turufjell.jpeg'), join(directory, 'public/carousel/Testfotograf_tf002.jpg'));
await mkdir(join(directory, 'app/admin/browser-test'), { recursive: true });
await cp(join(root, 'tests/e2e/fixture-page.jsx'), join(directory, 'app/admin/browser-test/page.js'));
await mkdir(join(directory, 'app/admin/map-browser-test'), { recursive: true });
await cp(join(root, 'tests/e2e/map-fixture-page.jsx'), join(directory, 'app/admin/map-browser-test/page.js'));
await mkdir(join(directory, 'app/admin/regnskap/browser-test'), { recursive: true });
await cp(join(root, 'tests/e2e/accounting-fixture-page.jsx'), join(directory, 'app/admin/regnskap/browser-test/page.js'));
await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
const child = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '4319'], {
  cwd: directory, stdio: 'inherit', env: {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || tmpdir(),
    NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', MOCK_DATA: 'true', MOCK_DATA_DIR: join(directory, '.mock-data'),
    APP_ENVIRONMENT: 'development', TOKEN_AUDIENCE: 'isolated-browser-tests',
    SECURITY_EVENT_HMAC_KEY: 'isolated-browser-test-hmac-key-not-production',
    AUTH_SECRET: testAuthSecret, AUTH_URL: testOrigin, AUTH_TRUST_HOST: 'true',
    AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: testTenant,
    AUTH_MICROSOFT_ENTRA_ID_ID: 'synthetic-client', AUTH_MICROSOFT_ENTRA_ID_SECRET: 'synthetic-secret',
    ADMIN_EMAILS: testAdmin, ADMIN_REQUIRED_ROLES: 'TFV.ReadOnly,TFV.MemberAdmin,TFV.SurveyAdmin,TFV.CmsEditor,TFV.SecurityAudit',
    DATABASE_URL: '', DATABASE_URL_UNPOOLED: '', MAILERSEND_ENABLED: 'false', MAILERSEND_BULK_ENABLED: 'false',
  },
});
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; child.kill('SIGTERM'); });
child.on('exit', async (code) => {
  // Only the exact temporary directory created by this process is removed.
  if (resolve(directory).startsWith(resolve(tmpdir()) + '/') && directory.includes('tfv-browser-tests-')) await rm(directory, { recursive: true, force: true });
  process.exitCode = stopping ? 0 : code || 1;
});

import { recoverStalledMatrikkelRuns } from '../../lib/background-watchdog.js';

// Netlify scheduled functions cannot be invoked through their public URL.
// Preview/manual test invocations additionally fail closed on environment.
export default async function handler() {
  if (process.env.CONTEXT !== 'production' || process.env.APP_ENVIRONMENT !== 'production') return;
  try {
    const result = await recoverStalledMatrikkelRuns(process.env.URL);
    if (result.result !== 'idle') console.info('Matrikkel watchdog', result);
  } catch {
    console.error('Matrikkel watchdog failed', { occurredAt: new Date().toISOString() });
    throw new Error('Matrikkel watchdog failed');
  }
}

export const config = { schedule: '*/5 * * * *' };

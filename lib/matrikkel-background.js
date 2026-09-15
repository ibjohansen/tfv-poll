const FUNCTION_PATH = '/.netlify/functions/matrikkel-sync-background';
const DISPATCH_TIMEOUT_MS = 10_000;

function dispatchError(code, status) {
  return Object.assign(new Error('Kunne ikke bekrefte oppstart av matrikkeljobben.'), { code, status });
}

// 202 bekrefter mottatt oppdrag, ikke at behandlingen er startet/fullført.
// Samme kontroll brukes både ved oppstart og når worker sender jobben videre.
export async function dispatchMatrikkelRun(runId, origin) {
  const secret = process.env.MATRIKKEL_JOB_SECRET;
  if (!secret) throw dispatchError('JOB_NOT_CONFIGURED');
  if (typeof runId !== 'string' || !/^[a-f0-9]{32}$/.test(runId)) throw dispatchError('INVALID_RUN_ID');
  let url;
  try {
    url = new URL(FUNCTION_PATH, origin);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
  } catch { throw dispatchError('INVALID_JOB_ORIGIN'); }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST', redirect: 'manual', cache: 'no-store',
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', 'X-Matrikkel-Job-Secret': secret },
      body: JSON.stringify({ runId }),
    });
  } catch { throw dispatchError('JOB_DISPATCH_UNAVAILABLE'); }
  // En innloggingsside med HTTP 200 må aldri tolkes som en startet jobb.
  if (response.status !== 202 || response.redirected) {
    throw dispatchError('JOB_DISPATCH_REJECTED', response.status);
  }
}

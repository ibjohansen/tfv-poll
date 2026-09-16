const FUNCTION_PATH = '/.netlify/functions/hamlet-member-sync-background';
const DISPATCH_TIMEOUT_MS = 10_000;

function dispatchError(code, status) {
  return Object.assign(new Error('Kunne ikke bekrefte oppstart av grendekoblingen.'), { code, status });
}

export async function dispatchHamletMemberSync(trigger, origin) {
  const secret = process.env.HAMLET_JOB_SECRET;
  if (!secret) throw dispatchError('JOB_NOT_CONFIGURED');
  if (!/^[1-9][0-9]{0,15}$/.test(String(trigger?.hamletId || ''))
    || !Number.isInteger(trigger?.polygonVersion) || trigger.polygonVersion < 1) {
    throw dispatchError('INVALID_TRIGGER');
  }
  let url;
  try {
    url = new URL(FUNCTION_PATH, origin);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
  } catch { throw dispatchError('INVALID_JOB_ORIGIN'); }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', 'X-Hamlet-Job-Secret': secret },
      body: JSON.stringify({ hamletId: String(trigger.hamletId), polygonVersion: trigger.polygonVersion }),
    });
  } catch { throw dispatchError('JOB_DISPATCH_UNAVAILABLE'); }
  if (response.status !== 202 || response.redirected) throw dispatchError('JOB_DISPATCH_REJECTED', response.status);
}

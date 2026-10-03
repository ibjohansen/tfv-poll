// Same-origin application requests only. Provider APIs have separate adapters.
// Never retry a write automatically: a timeout does not prove it was not saved.
export async function fetchApplication(path, options = {}, { failed, timeout = failed, invalid = failed, fetchImpl = fetch } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new Error(failed);
  }
  const deadline = AbortSignal.timeout(options.timeoutMs || 30_000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const init = { ...options };
  delete init.timeoutMs;
  let response;
  try {
    response = await fetchImpl(path, { credentials: 'same-origin', cache: 'no-store', ...init, redirect: 'error', signal });
  } catch (error) {
    if (options.signal?.aborted && options.signal.reason?.name !== 'TimeoutError') throw error;
    throw new Error(signal.reason?.name === 'TimeoutError' ? timeout : failed);
  }
  async function read(kind) {
    try { return await response[kind](); }
    catch (error) {
      if (options.signal?.aborted && options.signal.reason?.name !== 'TimeoutError') throw error;
      throw new Error(signal.reason?.name === 'TimeoutError' ? timeout : invalid);
    }
  }
  return {
    ok: response.ok, status: response.status, headers: response.headers,
    blob: () => read('blob'), text: () => read('text'),
    async json() {
      const body = await read('json');
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(invalid);
      return body;
    },
  };
}

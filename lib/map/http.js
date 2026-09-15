import { MapError } from './geo.js';

export async function readLimitedText(response, maxBytes = 5_000_000) {
  if (Number(response.headers.get('content-length')) > maxBytes) throw new MapError('Datamengden er for stor. Velg et mindre område.', 413);
  const reader = response.body?.getReader();
  if (!reader) throw new MapError('Datakilden ga et tomt svar.', 502);
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new MapError('Datamengden er for stor. Velg et mindre område.', 413);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function readLimitedJson(response, maxBytes = 5_000_000) {
  return JSON.parse(await readLimitedText(response, maxBytes));
}

export async function fetchMapJson(url, { source, fetchImpl = fetch, signal, ...options }) {
  // Only adapters supply URLs; no URL/hostname ever comes from the browser.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const timeout = AbortSignal.timeout(18_000);
      const response = await fetchImpl(url, {
        ...options, cache: 'no-store', redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: { Accept: 'application/json', 'User-Agent': 'TurufjellVel-MapExplorer/1.0 (+https://medlemsservice.turufjellvel.no)', ...options.headers },
      });
      if (response.status === 429) throw new MapError(`${source} er opptatt. Vent litt før du prøver igjen.`, 503);
      if (!response.ok) {
        if (response.status >= 500 && attempt === 0 && !signal?.aborted) { await response.body?.cancel(); continue; }
        throw new MapError(`Kunne ikke hente data fra ${source}. Prøv igjen.`, 502);
      }
      return await readLimitedJson(response);
    } catch (error) {
      if (error instanceof MapError) throw error;
      if (signal?.aborted) throw new MapError(`Søket hos ${source} tok for lang tid eller ble avbrutt. Prøv et mindre område.`, 504);
      if (attempt === 1) throw new MapError(`Kunne ikke hente data fra ${source}. Prøv igjen.`, 502);
    }
  }
}

// Browser talks only to the authenticated Node routes, never to data providers.
import { fetchApplication } from '../browser-http.js';

export async function requestMap(path, body, signal, fallback = '') {
  const response = await fetchApplication(`/api/admin/map/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
    cache: 'no-store', body: JSON.stringify(body), signal, timeoutMs: 35_000,
  }, { failed: fallback });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || fallback);
  }
  return response;
}

export async function loadMapHamlets(signal, fallback = '') {
  const response = await fetchApplication('/api/admin/map/hamlets', { signal }, { failed: fallback });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || fallback);
  return data.hamlets;
}

export async function persistMapHamlet(input, signal, fallback = '') {
  return (await requestMap('hamlets', input, signal, fallback)).json();
}

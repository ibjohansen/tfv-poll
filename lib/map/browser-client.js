// Browser talks only to the authenticated Node routes, never to data providers.
export async function requestMap(path, body, signal, fallback = '') {
  const response = await fetch(`/api/admin/map/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
    cache: 'no-store', body: JSON.stringify(body), signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || fallback);
  }
  return response;
}

export async function loadMapHamlets(signal, fallback = '') {
  const response = await fetch('/api/admin/map/hamlets', { credentials: 'same-origin', cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || fallback);
  return data.hamlets;
}

export async function persistMapHamlet(input, signal, fallback = '') {
  return (await requestMap('hamlets', input, signal, fallback)).json();
}

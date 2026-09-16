// Browser talks only to the authenticated Node routes, never to data providers.
export async function requestMap(path, body, signal) {
  const response = await fetch(`/api/admin/map/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
    cache: 'no-store', body: JSON.stringify(body), signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || 'Kartforespørselen mislyktes. Prøv igjen.');
  }
  return response;
}

export async function loadMapHamlets(signal) {
  const response = await fetch('/api/admin/map/hamlets', { credentials: 'same-origin', cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Kunne ikke hente grendene.');
  return data.hamlets;
}

export async function persistMapHamlet(input, signal) {
  return (await (await requestMap('hamlets', input, signal)).json()).hamlet;
}

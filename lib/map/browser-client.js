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

export async function downloadMapExport(body, signal) {
  const response = await requestMap('export', body, signal);
  const blob = await response.blob();
  signal?.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'turufjell-eksport';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class RequestBodyError extends Error {
  constructor(code, status) { super(code); this.name = 'RequestBodyError'; this.code = code; this.status = status; }
}

export async function readJsonBody(request, maxBytes = 1024 * 1024) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new RequestBodyError('JSON_REQUIRED', 415);
  if (Number(request.headers.get('content-length')) > maxBytes) throw new RequestBodyError('BODY_TOO_LARGE', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('Invalid JSON object');
  const decoder = new TextDecoder();
  let length = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new RequestBodyError('BODY_TOO_LARGE', 413);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const input = JSON.parse(text);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SyntaxError('Invalid JSON object');
  return input;
}

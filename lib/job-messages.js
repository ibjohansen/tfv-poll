import nb from '../locales/nb/jobs.js';

// Versioned envelope in existing text columns. No schema/backfill or historical
// rewrite is required. Unknown/provider text is never echoed by this decoder.
const PREFIX = 'tfv-message:v1:';
const known = (code) => typeof code === 'string' && Object.hasOwn(nb, code);
const legacy = new Map(Object.entries(nb).filter(([, text]) => !text.includes('{')).map(([code, text]) => [text, { code, params: {} }]));
legacy.set('Bakgrunnsjobben kunne ikke startes. Prøv igjen eller kontroller konfigurasjonen.', { code: 'JOB_START_FAILED', params: {} });
legacy.set('Avbrutt behandling etter tre forsøk. Start en ny kontrollert kjøring.', { code: 'JOB_ATTEMPTS_EXHAUSTED', params: { attempts: 3 } });
legacy.set('Bakgrunnsjobben kom ikke videre etter tre gjenopptakingsforsøk. Kontroller funksjonsloggen før en ny kjøring.', { code: 'JOB_RECOVERY_EXHAUSTED', params: { attempts: 3 } });

function safeParams(code, params) {
  const result = {};
  for (const key of nb[code].matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    const name = key[1], value = params?.[name];
    // Only bounded numeric diagnostics/property identifiers are permitted.
    if ((typeof value === 'number' || typeof value === 'string') && /^\d{1,9}$/.test(String(value))) result[name] = String(value);
    else result[name] = '–';
  }
  return result;
}

export function jobMessage(code, params = {}) {
  code = known(code) ? code : 'UNKNOWN';
  return PREFIX + JSON.stringify({ code, params: safeParams(code, params) });
}

export function readJobMessage(value) {
  if (typeof value !== 'string' || value.length > 2048) return { code: 'UNKNOWN', params: {} };
  if (value.startsWith(PREFIX)) {
    try {
      const data = JSON.parse(value.slice(PREFIX.length));
      if (known(data?.code)) return { code: data.code, params: safeParams(data.code, data.params) };
    } catch { /* Damaged/unknown envelopes must not expose stored text. */ }
    return { code: 'UNKNOWN', params: {} };
  }
  if (known(value)) return { code: value, params: safeParams(value, {}) };
  if (legacy.has(value)) return legacy.get(value);
  for (const code of ['UPSTREAM_HTTP', 'MATRIKKEL_HTTP', 'ADDRESS_HTTP', 'A5_HTTP', 'MATRIKKEL_PROPERTY_MISSING']) {
    const pattern = nb[code].split(/(\{\w+\})/).map((part) => part.startsWith('{')
      ? '(\\d{1,9})' : [...part].map((character) => '^$.*+?()[]{}|\\'.includes(character) ? '\\' + character : character).join('')).join('');
    const match = value.match(new RegExp('^' + pattern + '$'));
    if (match) {
      const names = [...nb[code].matchAll(/\{(\w+)\}/g)].map((item) => item[1]);
      return { code, params: Object.fromEntries(names.map((name, index) => [name, match[index + 1]])) };
    }
  }
  return { code: 'UNKNOWN', params: {} };
}

export function jobMessageFromError(error) {
  const code = [error?.messageCode, error?.code, error?.message].find(known)
    || (['TimeoutError', 'AbortError'].includes(error?.name) ? 'TIMEOUT' : 'UNKNOWN');
  return jobMessage(code, error?.messageParams);
}

export function formatJobMessage(value, t) {
  if (!value) return '';
  const { code, params } = readJobMessage(value);
  return t(code, params, t('UNKNOWN'));
}

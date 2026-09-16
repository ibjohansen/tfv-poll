function valueAt(messages, key) {
  return String(key || '').split('.').reduce((value, part) => value?.[part], messages);
}

export function translate(messages, key, values = {}, fallback = key) {
  const template = valueAt(messages, key);
  if (typeof template !== 'string') return fallback;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => (
    Object.hasOwn(values, name) ? String(values[name]) : match
  ));
}

export function scopedTranslator(messages, scope = '') {
  const prefix = scope ? `${scope}.` : '';
  return (key, values, fallback) => translate(messages, `${prefix}${key}`, values, fallback);
}

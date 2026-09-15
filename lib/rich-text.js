// Restricted Tiptap JSON; never persist arbitrary HTML or DOM attributes.
const blocks = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote']);
export function safeRichTextLink(value) {
  if (typeof value !== 'string' || value.length > 2000 || /[\s\x00-\x1f\x7f\\]/.test(value)) return null;
  if (/^\/(?!\/)/.test(value) || /^#[a-zA-Z0-9_-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? value : null;
  } catch { return null; }
}
export function sanitizeRichText(value) {
  if (value === undefined || value === null) return null;
  let nodes = 0, characters = 0;
  function visit(node, parent, depth = 0) {
    if (++nodes > 10000 || depth > 20 || !node || typeof node !== 'object' || Array.isArray(node)) throw new Error('Invalid page');
    const { type } = node;
    const allowed = parent === null ? type === 'doc'
      : ['paragraph', 'heading'].includes(parent) ? ['text', 'hardBreak'].includes(type)
        : ['bulletList', 'orderedList'].includes(parent) ? type === 'listItem' : blocks.has(type);
    if (!allowed) throw new Error('Invalid page');
    if (type === 'text') {
      if (typeof node.text !== 'string' || !node.text.length || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(node.text)) throw new Error('Invalid page');
      characters += node.text.length;
      if (characters > 100000) throw new Error('Invalid page');
      const marks = [];
      if (node.marks !== undefined && (!Array.isArray(node.marks) || node.marks.length > 20)) throw new Error('Invalid page');
      for (const mark of node.marks || []) {
        if (marks.some((existing) => existing.type === mark?.type)) continue;
        if (mark?.type === 'bold' || mark?.type === 'italic') marks.push({ type: mark.type });
        if (mark?.type === 'link' && safeRichTextLink(mark.attrs?.href)) marks.push({ type: 'link', attrs: { href: safeRichTextLink(mark.attrs.href) } });
      }
      return { type, text: node.text, ...(marks.length ? { marks } : {}) };
    }
    if (type === 'hardBreak') return { type };
    if (node.content !== undefined && !Array.isArray(node.content)) throw new Error('Invalid page');
    const content = (node.content || []).map((child) => visit(child, type, depth + 1));
    if (['doc', 'blockquote', 'bulletList', 'orderedList', 'listItem'].includes(type) && !content.length) throw new Error('Invalid page');
    if (type === 'listItem' && content[0]?.type !== 'paragraph') throw new Error('Invalid page');
    const result = { type, ...(content.length ? { content } : {}) };
    if (type === 'heading') result.attrs = { level: node.attrs?.level === 3 ? 3 : 2 };
    if (type === 'orderedList') result.attrs = { start: Number.isInteger(node.attrs?.start) && node.attrs.start > 0 && node.attrs.start <= 10000 ? node.attrs.start : 1 };
    return result;
  }
  const result = visit(value, null);
  if (new TextEncoder().encode(JSON.stringify(result)).length > 750000) throw new Error('Invalid page');
  return result;
}
export function textToRichText(value) {
  const text = String(value || '');
  return { type: 'doc', content: (text ? text.split(/\n+/) : ['']).map((line) => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })) };
}
export function richTextToPlainText(document) {
  function visit(node) {
    if (node.type === 'text') return node.text;
    if (node.type === 'hardBreak') return '\n';
    return (node.content || []).map(visit).join(['paragraph', 'heading'].includes(node.type) ? '' : '\n');
  }
  return document ? visit(document) : '';
}

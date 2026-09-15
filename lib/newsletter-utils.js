import { sanitizeRichText, richTextToPlainText } from './rich-text.js';

export function normalizeNewsletter(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid newsletter');
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  if (!subject || subject.length > 160 || /[\x00-\x1f\x7f]/.test(subject)) throw new Error('Invalid newsletter');
  let body;
  try { body = sanitizeRichText(input.body); } catch { throw new Error('Invalid newsletter'); }
  if (!body || !richTextToPlainText(body).trim()) throw new Error('Invalid newsletter');
  if (!Array.isArray(input.groupIds) || !input.groupIds.length || input.groupIds.length > 100) throw new Error('Invalid newsletter');
  const groupIds = [...new Set(input.groupIds.map(String))];
  if (!groupIds.every((id) => /^[1-9][0-9]{0,15}$/.test(id))) throw new Error('Invalid newsletter');
  return { subject, body, groupIds };
}

function escape(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
export function renderNewsletter({ subject, body, baseUrl, isTest = false }) {
  const document = sanitizeRichText(body);
  const tags = { paragraph: 'p', blockquote: 'blockquote', bulletList: 'ul', orderedList: 'ol', listItem: 'li' };
  function render(node) {
    if (node.type === 'text') return (node.marks || []).reduce((text, mark) => {
      if (mark.type !== 'link') { const tag = mark.type === 'bold' ? 'strong' : 'em'; return `<${tag}>${text}</${tag}>`; }
      const href = new URL(mark.attrs.href, baseUrl).toString();
      return `<a href="${escape(href)}" rel="noopener noreferrer">${text}</a>`;
    }, escape(node.text));
    if (node.type === 'hardBreak') return '<br>';
    const tag = node.type === 'heading' ? `h${node.attrs.level}` : tags[node.type];
    return `<${tag}${node.type === 'orderedList' ? ` start="${node.attrs.start}"` : ''}>${(node.content || []).map(render).join('')}</${tag}>`;
  }
  return {
    subject: `${isTest ? '[TEST] ' : ''}${subject}`,
    html: `<!doctype html><html lang="nb"><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#494038;background:#f3efe7;padding:24px"><main style="max-width:640px;margin:auto;background:white;padding:24px"><p>Turufjell Vel${isTest ? ' · Testmelding' : ''}</p><h1>${escape(subject)}</h1>${document.content.map(render).join('')}<hr><p>Denne e-posten er sendt fra Medlemsservice i Turufjell Vel.</p></main></body></html>`,
    text: `${isTest ? 'TESTMELDING\n\n' : ''}Turufjell Vel\n\n${subject}\n\n${richTextToPlainText(document)}\n\nDenne e-posten er sendt fra Medlemsservice i Turufjell Vel.`,
  };
}

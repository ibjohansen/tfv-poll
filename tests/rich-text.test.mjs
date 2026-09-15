import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRichText, safeRichTextLink, textToRichText, richTextToPlainText } from '../lib/rich-text.js';
import { validateCmsPageInput } from '../lib/cms-validation.js';

test('legacy article text is preserved as literal text, never parsed as HTML or Markdown', () => {
  const legacy = '<script>alert(1)</script>\n**Ikke fet**';
  const doc = sanitizeRichText(textToRichText(legacy));
  assert.equal(richTextToPlainText(doc), legacy);
  assert.equal(doc.content[0].content[0].type, 'text');
  assert.deepEqual(sanitizeRichText(textToRichText('')), { type: 'doc', content: [{ type: 'paragraph' }] });
});
test('rich text permits only semantic nodes/marks and removes event/style/unsafe link attributes', () => {
  const doc = sanitizeRichText({ type: 'doc', attrs: { onload: 'evil' }, content: [
    { type: 'heading', attrs: { level: 1, style: 'color:red' }, content: [{ type: 'text', text: 'Overskrift' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Lenke', marks: [
      { type: 'bold', attrs: { onclick: 'evil' } }, { type: 'italic' },
      { type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'textStyle', attrs: { color: 'red' } },
    ] }] },
    { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Punkt' }] }] }] },
  ] });
  assert.equal(doc.content[0].attrs.level, 2);
  assert.deepEqual(doc.content[1].content[0].marks, [{ type: 'bold' }, { type: 'italic' }]);
  assert.equal(doc.content[2].attrs.start, 3);
  assert.doesNotMatch(JSON.stringify(doc), /onclick|onload|style|javascript|textStyle/);
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>', '//evil.test', 'https://user:password@example.test', 'java\nscript:alert(1)', '/\\evil.test']) assert.equal(safeRichTextLink(url), null);
  for (const url of ['https://example.test', '/nyheter', '#kontakt', 'mailto:post@example.test']) assert.equal(safeRichTextLink(url), url);
});
test('invalid structures, deep nesting and excessive text are rejected before persistence', () => {
  for (const value of [{ type: 'iframe' }, { type: 'doc', content: [] }, { type: 'doc', content: [{ type: 'text', text: 'invalid' }] }, textToRichText('x'.repeat(100001))]) assert.throws(() => sanitizeRichText(value), /Invalid page/);
  let deep = { type: 'paragraph' };
  for (let i = 0; i < 25; i++) deep = { type: 'blockquote', content: [deep] };
  assert.throws(() => sanitizeRichText({ type: 'doc', content: [deep] }), /Invalid page/);
  assert.equal(validateCmsPageInput({ title: 'Test', slug: 'test', category: 'Nyheter', status: 'draft', bodyRichText: { type: 'script' } }), false);
});

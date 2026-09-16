import { createElement } from 'react';
import { sanitizeRichText } from '@/lib/rich-text';
import { useI18n } from '@/components/LocaleProvider';

const tags = { paragraph: 'p', blockquote: 'blockquote', bulletList: 'ul', orderedList: 'ol', listItem: 'li', hardBreak: 'br' };
export default function RichTextContent({ value }) {
  const { t } = useI18n('cms.common');
  let document;
  try { document = sanitizeRichText(value); } catch { return <p>{t('richTextError')}</p>; }
  function render(node, key) {
    if (node.type === 'text') {
      return (node.marks || []).reduce((text, mark, index) => mark.type === 'link'
        ? <a key={`${key}-${index}`} href={mark.attrs.href} rel="noopener noreferrer">{text}</a>
        : createElement(mark.type === 'bold' ? 'strong' : 'em', { key: `${key}-${index}` }, text), node.text);
    }
    const tag = node.type === 'heading' ? `h${node.attrs.level}` : tags[node.type];
    return createElement(tag, { key, ...(node.type === 'orderedList' ? { start: node.attrs.start } : {}) },
      ...(node.content || []).map((child, index) => render(child, `${key}-${index}`)));
  }
  return document?.content.map((node, index) => render(node, String(index))) || null;
}

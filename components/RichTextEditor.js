'use client';

import { useEffect, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { safeRichTextLink, textToRichText } from '@/lib/rich-text';
import { useI18n } from '@/components/LocaleProvider';

export default function RichTextEditor({ value, plainText = '', onChange, disabled = false }) {
  const { t } = useI18n('cms.richEditor');
  const [link, setLink] = useState('');
  const [message, setMessage] = useState('');
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({
      heading: { levels: [2, 3] }, code: false, codeBlock: false, horizontalRule: false,
      strike: false, underline: false, link: { openOnClick: false, autolink: false,
        isAllowedUri: (url) => Boolean(safeRichTextLink(url)) },
    })],
    content: value || textToRichText(plainText), editable: !disabled,
    editorProps: { attributes: { role: 'textbox', 'aria-label': t('mainText'), 'aria-multiline': 'true', class: 'cms-rich-text' } },
    onUpdate: ({ editor: current }) => onChange(current.getJSON()),
  });
  const state = useEditorState({ editor, selector: ({ editor: current }) => current ? {
    bold: current.isActive('bold'), italic: current.isActive('italic'), paragraph: current.isActive('paragraph'),
    heading2: current.isActive('heading', { level: 2 }), heading3: current.isActive('heading', { level: 3 }),
    bulletList: current.isActive('bulletList'), orderedList: current.isActive('orderedList'), blockquote: current.isActive('blockquote'),
  } : {} });
  // Toggling editability is not a content change. Tiptap otherwise emits an
  // update and marks a successfully saved newsletter dirty again.
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  const buttons = [
    [t('paragraph'), 'paragraph', () => editor.chain().focus().setParagraph().run()],
    [t('heading2'), 'heading2', () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
    [t('heading3'), 'heading3', () => editor.chain().focus().toggleHeading({ level: 3 }).run()],
    [t('bold'), 'bold', () => editor.chain().focus().toggleBold().run()],
    [t('italic'), 'italic', () => editor.chain().focus().toggleItalic().run()],
    [t('bulletList'), 'bulletList', () => editor.chain().focus().toggleBulletList().run()],
    [t('orderedList'), 'orderedList', () => editor.chain().focus().toggleOrderedList().run()],
    [t('quote'), 'blockquote', () => editor.chain().focus().toggleBlockquote().run()],
  ];
  return <div className="cms-rich-editor">
    <span>{t('mainText')}</span><div className="cms-rich-toolbar" role="group" aria-label={t('formatting')}>
      {buttons.map(([label, key, action]) => <button className="admin-button" key={key} type="button" aria-pressed={Boolean(state?.[key])} disabled={disabled || !editor} onClick={action}>{label}</button>)}
      <button type="button" className="admin-button" disabled={disabled || !editor} onClick={() => editor.chain().focus().undo().run()}>{t('undo')}</button>
      <button type="button" className="admin-button" disabled={disabled || !editor} onClick={() => editor.chain().focus().redo().run()}>{t('redo')}</button>
    </div><EditorContent editor={editor} />
    <div className="cms-rich-toolbar"><label>{t('linkAddress')}<input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…" maxLength={2000} disabled={disabled} /></label>
      <button className="admin-button" type="button" disabled={disabled || !editor} onClick={() => {
        const href = safeRichTextLink(link.trim());
        if (!href) { setMessage(t('invalidLink')); return; }
        if (editor.state.selection.empty) { setMessage(t('selectText')); return; }
        editor.chain().focus().setLink({ href }).run(); setMessage(t('linkAdded')); setLink('');
      }}>{t('addLink')}</button>
      <button className="admin-button" type="button" disabled={disabled || !editor} onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}>{t('removeLink')}</button>
    </div><small>{t('help')}</small>
    {message && <p role="status">{message}</p>}
  </div>;
}

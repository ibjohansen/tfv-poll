'use client';

import { useEffect, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { safeRichTextLink, textToRichText } from '@/lib/rich-text';

export default function RichTextEditor({ value, plainText = '', onChange, disabled = false }) {
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
    editorProps: { attributes: { role: 'textbox', 'aria-label': 'Hovedtekst', 'aria-multiline': 'true', class: 'cms-rich-text' } },
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
    ['Avsnitt', 'paragraph', () => editor.chain().focus().setParagraph().run()],
    ['Overskrift 2', 'heading2', () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
    ['Overskrift 3', 'heading3', () => editor.chain().focus().toggleHeading({ level: 3 }).run()],
    ['Fet', 'bold', () => editor.chain().focus().toggleBold().run()],
    ['Kursiv', 'italic', () => editor.chain().focus().toggleItalic().run()],
    ['Punktliste', 'bulletList', () => editor.chain().focus().toggleBulletList().run()],
    ['Nummerert liste', 'orderedList', () => editor.chain().focus().toggleOrderedList().run()],
    ['Sitat', 'blockquote', () => editor.chain().focus().toggleBlockquote().run()],
  ];
  return <div className="cms-rich-editor">
    <span>Hovedtekst</span><div className="cms-rich-toolbar" role="group" aria-label="Formatering">
      {buttons.map(([label, key, action]) => <button className="admin-button" key={key} type="button" aria-pressed={Boolean(state?.[key])} disabled={disabled || !editor} onClick={action}>{label}</button>)}
      <button type="button" className="admin-button" disabled={disabled || !editor} onClick={() => editor.chain().focus().undo().run()}>Angre</button>
      <button type="button" className="admin-button" disabled={disabled || !editor} onClick={() => editor.chain().focus().redo().run()}>Gjør om</button>
    </div><EditorContent editor={editor} />
    <div className="cms-rich-toolbar"><label>Lenkeadresse<input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…" maxLength={2000} disabled={disabled} /></label>
      <button className="admin-button" type="button" disabled={disabled || !editor} onClick={() => {
        const href = safeRichTextLink(link.trim());
        if (!href) { setMessage('Bruk en gyldig https-, http-, mailto- eller intern lenke.'); return; }
        if (editor.state.selection.empty) { setMessage('Marker teksten som skal bli en lenke først.'); return; }
        editor.chain().focus().setLink({ href }).run(); setMessage('Lenken er lagt til.'); setLink('');
      }}>Legg til lenke</button>
      <button className="admin-button" type="button" disabled={disabled || !editor} onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}>Fjern lenke</button>
    </div><small>Enkel formatering, uten egendefinerte skrifter, farger eller HTML. Maks 100 000 teksttegn.</small>
    {message && <p role="status">{message}</p>}
  </div>;
}

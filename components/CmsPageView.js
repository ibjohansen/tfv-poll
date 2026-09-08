import Image from 'next/image';
import { fileTypeLabel, formatFileSize } from '@/lib/file-format';

function paragraphs(text) {
  return String(text || '').split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

export default function CmsPageView({ page, preview = false }) {
  return (
    <article className="cms-article">
      <header className="cms-article-header">
        <p className="eyebrow">{page.category}</p>
        <h1>{page.title}</h1>
        {page.intro && <div className="cms-article-intro">{paragraphs(page.intro).map((text, index) => <p key={index}>{text}</p>)}</div>}
      </header>

      {page.image && (
        <figure className="cms-article-figure">
          <div className="cms-article-image">
            <Image src={page.image.url} alt={page.image_alt || ''} fill sizes="(max-width: 900px) 100vw, 960px" unoptimized={preview} />
          </div>
          {page.image_caption && <figcaption>{page.image_caption}</figcaption>}
        </figure>
      )}

      {page.body && <div className="cms-article-body">{paragraphs(page.body).map((text, index) => <p key={index}>{text}</p>)}</div>}

      {page.attachments?.length > 0 && (
        <section className="cms-documents" aria-labelledby="cms-documents-title">
          <h2 id="cms-documents-title">Dokumenter</h2>
          <ul>
            {page.attachments.map((file) => (
              <li key={file.id}>
                <a href={`${file.url}?download=1`}>
                  <span className="cms-document-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7V3Zm7 0v5h5M9.5 13h6M9.5 17h6" /></svg></span>
                  <span><strong>{file.title}</strong><small>{fileTypeLabel(file.mime_type, file.original_filename)} · {formatFileSize(file.size_bytes)}</small></span>
                  <svg className="cms-download-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 20h14" /></svg>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

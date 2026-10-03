import { cmsCategories } from './cms-validation.js';

export const emptyCmsPage = {
  title: '', slug: '', intro: '', body: '', body_rich_text: null, category: cmsCategories[0],
  image_alt: '', image_caption: '', image_decorative: false, status: 'draft', version: 1,
  image: null, attachments: [],
};

export function cmsEditorPayload(page, status, overrideReason) {
  return {
    title: page.title, slug: page.slug, intro: page.intro || '', body: page.body || '',
    bodyRichText: page.body_rich_text || null, category: page.category,
    imageAlt: page.image_alt || '', imageCaption: page.image_caption || '',
    imageDecorative: Boolean(page.image_decorative), status,
    expectedVersion: page.id ? page.version : undefined, overrideReason,
  };
}

export const latestCmsVersion = (current, candidate) => Math.max(Number(current.version) || 1, Number(candidate) || 1);

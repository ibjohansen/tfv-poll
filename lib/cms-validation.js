export const cmsCategories = ['Nyttig info', 'Administrativt', 'Årsmøter', 'Nyheter'];
export const cmsStatuses = ['draft', 'published'];

const reservedSlugs = new Set(['admin', 'api', 'survey', '_next']);

export function createSlug(title) {
  if (typeof title !== 'string') return '';
  return title
    .trim()
    .toLowerCase()
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'o')
    .replaceAll('å', 'a')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');
}

export function normalizeSlugInput(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'o')
    .replaceAll('å', 'a')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 100);
}

export function isValidCmsSlug(value) {
  return typeof value === 'string' && value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !reservedSlugs.has(value);
}

function optionalText(value, maximum) {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= maximum);
}

export function validateCmsPageInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  return typeof input.title === 'string' && input.title.trim().length > 0 && input.title.trim().length <= 120 &&
    isValidCmsSlug(input.slug) && optionalText(input.intro, 500) && optionalText(input.body, 100000) &&
    optionalText(input.imageAlt, 300) && optionalText(input.imageCaption, 500) &&
    cmsCategories.includes(input.category) && cmsStatuses.includes(input.status);
}

export function isPublicCmsPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.slice(1).includes('/')) return false;
  return isValidCmsSlug(pathname.slice(1));
}

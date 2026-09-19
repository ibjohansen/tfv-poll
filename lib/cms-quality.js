import { richTextToPlainText, sanitizeRichText } from './rich-text.js';

const genericLinkTexts = new Set(['klikk her', 'les mer', 'her', 'link', 'click here', 'read more']);

function value(page, camel, snake = camel) {
  return page?.[camel] ?? page?.[snake];
}

function finding(code, severity, field, values = {}) {
  return { id: `${severity}:${code}:${field}`, code, severity, field, values };
}

export function analyzeCmsContent(page, files = page?.attachments || []) {
  const findings = [];
  const title = String(value(page, 'title') || '').trim();
  const intro = String(value(page, 'intro') || '').trim();
  const imageAlt = String(value(page, 'imageAlt', 'image_alt') || '').trim();
  const imageDecorative = Boolean(value(page, 'imageDecorative', 'image_decorative'));
  const image = page?.image || files.find?.((file) => file.kind === 'image');
  const attachments = page?.attachments || files.filter?.((file) => file.kind === 'attachment') || [];

  if (!title) findings.push(finding('missingTitle', 'error', 'cms-title'));
  else if (title.length > 70) findings.push(finding('longTitle', 'warning', 'cms-title', { count: title.length }));
  if (!intro) findings.push(finding('missingIntro', 'warning', 'cms-intro'));
  if (image && !imageDecorative && !imageAlt) findings.push(finding('missingImageAlt', 'error', 'cms-image-alt'));
  else if (image && !imageDecorative && imageAlt.length < 5) findings.push(finding('weakImageAlt', 'error', 'cms-image-alt'));
  for (const file of attachments) {
    if (!String(file.title || '').trim()) findings.push(finding('missingDocumentTitle', 'error', `cms-file-title-${file.id}`));
  }

  let rich = null;
  try { rich = sanitizeRichText(value(page, 'bodyRichText', 'body_rich_text')); } catch {
    findings.push(finding('invalidRichText', 'error', 'cms-body'));
  }
  if (rich) {
    let previousHeading = 1;
    function visit(node) {
      if (node.type === 'heading') {
        const level = node.attrs?.level || 2;
        if (level > previousHeading + 1) findings.push(finding('headingJump', 'warning', 'cms-body', { from: previousHeading, to: level }));
        previousHeading = level;
      }
      if (node.type === 'text') {
        for (const mark of node.marks || []) {
          if (mark.type !== 'link') continue;
          if (!mark.attrs?.href) findings.push(finding('emptyLink', 'error', 'cms-body'));
          if (genericLinkTexts.has(node.text.trim().toLowerCase())) findings.push(finding('genericLink', 'warning', 'cms-body', { text: node.text }));
        }
      }
      for (const child of node.content || []) visit(child);
    }
    visit(rich);
    if (!richTextToPlainText(rich).trim()) findings.push(finding('emptyBody', 'warning', 'cms-body'));
  } else if (!String(value(page, 'body') || '').trim()) {
    findings.push(finding('emptyBody', 'warning', 'cms-body'));
  }

  return findings.filter((item, index, all) => all.findIndex(({ code, field }) => code === item.code && field === item.field) === index);
}

export function validateCmsPublication(page, files, overrideReason = '') {
  const findings = analyzeCmsContent(page, files);
  const errors = findings.filter(({ severity }) => severity === 'error');
  const warnings = findings.filter(({ severity }) => severity === 'warning');
  const reason = String(overrideReason || '').trim();
  return {
    findings,
    errors,
    warnings,
    valid: errors.length === 0 && (warnings.length === 0 || reason.length >= 10),
    overrideReason: reason || null,
  };
}

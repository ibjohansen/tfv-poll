export function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} MB`;
}

export function fileTypeLabel(mimeType, filename = '') {
  const extension = filename.split('.').pop()?.toUpperCase();
  const labels = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'application/zip': 'ZIP',
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/webp': 'WebP',
    'image/gif': 'GIF',
  };
  return labels[mimeType] || extension || 'Fil';
}

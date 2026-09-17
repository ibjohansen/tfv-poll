const megabyte = 1024 * 1024;

function isZip(bytes) {
  const header = bytes.slice(0, 4).toString('hex');
  return ['504b0304', '504b0506', '504b0708'].includes(header);
}

function isOle(bytes) {
  return bytes.slice(0, 8).toString('hex') === 'd0cf11e0a1b11ae1';
}

const formats = {
  jpg: { mime: 'image/jpeg', signature: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: 'image/jpeg', signature: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: 'image/png', signature: (b) => b.slice(0, 8).toString('hex') === '89504e470d0a1a0a' },
  webp: { mime: 'image/webp', signature: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
  gif: { mime: 'image/gif', signature: (b) => ['GIF87a', 'GIF89a'].includes(b.slice(0, 6).toString()) },
  pdf: { mime: 'application/pdf', signature: (b) => b.slice(0, 5).toString() === '%PDF-' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signature: isZip },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: isZip },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', signature: isZip },
  zip: { mime: 'application/zip', signature: isZip },
  doc: { mime: 'application/msword', signature: isOle },
  xls: { mime: 'application/vnd.ms-excel', signature: isOle },
  ppt: { mime: 'application/vnd.ms-powerpoint', signature: isOle },
};

function safeFilename(value) {
  return String(value || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
}

export function defaultFileTitle(filename) {
  return filename.replace(/\.[^.]+$/, '').trim().slice(0, 200) || 'Fil';
}

export async function validateUploadedFile(file, kind = 'attachment') {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('File is required');
  const filename = safeFilename(file.name);
  const extension = filename.split('.').pop()?.toLowerCase();
  const format = formats[extension];
  const maximum = kind === 'image' ? 10 * megabyte : 20 * megabyte;
  if (!filename || !format || file.size < 1 || file.size > maximum) throw new Error('Invalid file');
  if (kind === 'image' && !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) throw new Error('Invalid image');
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!format.signature(bytes)) throw new Error('Invalid file');
  return { bytes, extension, filename, mimeType: format.mime, size: bytes.length };
}

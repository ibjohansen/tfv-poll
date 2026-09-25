import 'server-only';
import { suggestReceipt } from './accounting-receipts.js';

export async function readAccountingReceipt(file) {
  if (file.mimeType !== 'application/pdf') return { ...suggestReceipt('', file.filename), warning: 'manualImage' };
  let task;
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    task = getDocument({ data: new Uint8Array(file.bytes), isEvalSupported: false, useSystemFonts: false,
      useWasm: false, disableFontFace: true, verbosity: 0 });
    const document = await task.promise;
    if (document.numPages > 20) return { ...suggestReceipt('', file.filename), warning: 'manualPdf' };
    let text = '';
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      text += content.items.map((item) => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('') + '\n';
      page.cleanup();
      if (text.length > 150000) break;
    }
    return { ...suggestReceipt(text, file.filename), ...(text.trim() ? {} : { warning: 'manualPdf' }) };
  } catch {
    return { ...suggestReceipt('', file.filename), warning: 'manualPdf' };
  } finally {
    if (task) await task.destroy().catch(() => {});
  }
}

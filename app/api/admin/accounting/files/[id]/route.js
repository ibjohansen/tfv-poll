import { getAccountingAttachment } from '@/lib/accounting';
import { downloadCmsObject } from '@/lib/cms-storage';
import { accountingFailure } from '@/lib/accounting-http';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const file = await getAccountingAttachment((await params).id);
    const object = await downloadCmsObject(file.storage_key);
    if (!object.Body) throw new Error('Missing object body');
    const name = file.original_filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'bilag';
    return new Response(await object.Body.transformToByteArray(), { headers: {
      'Content-Type': file.mime_type, 'Content-Length': String(file.size_bytes),
      'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(file.original_filename)}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return accountingFailure(error); }
}

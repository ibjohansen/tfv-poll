import { handleMapRequest } from '@/lib/map/api';
import { createMapExport } from '@/lib/map/service';

export const runtime = 'nodejs';

export async function POST(request) {
  return handleMapRequest(request, async (input, user, options) => {
    const result = await createMapExport(input, user, options);
    return new Response(result.body, { headers: { 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="${result.filename}"` } });
  });
}

import { handleMapRequest } from '@/lib/map/api';
import { saveActivityMapCatalogEntry } from '@/lib/activity-map-catalog-service';

export const runtime = 'nodejs';

export async function POST(request) {
  return handleMapRequest(request, async (input) => Response.json({ catalog: await saveActivityMapCatalogEntry(input) }));
}

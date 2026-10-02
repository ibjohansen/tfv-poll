import { handleMapRequest } from '@/lib/map/api';
import { getAdminActivityMapFeatures, saveActivityMapFeature } from '@/lib/activity-map-service';
import { getActivityMapCatalog } from '@/lib/activity-map-catalog-service';

export const runtime = 'nodejs';

export async function GET(request) {
  return handleMapRequest(request, async () => {
    const [features, catalog] = await Promise.all([getAdminActivityMapFeatures(), getActivityMapCatalog()]);
    return Response.json({ features, catalog });
  }, { readOnly: true });
}

export async function POST(request) {
  return handleMapRequest(request, async (input) => Response.json({ feature: await saveActivityMapFeature(input) }));
}

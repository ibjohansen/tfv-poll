import { handleMapRequest } from '@/lib/map/api';
import { getAdminActivityMapFeatures, saveActivityMapFeature } from '@/lib/activity-map-service';

export const runtime = 'nodejs';

export async function GET(request) {
  return handleMapRequest(request, async () => Response.json({ features: await getAdminActivityMapFeatures() }), { readOnly: true });
}

export async function POST(request) {
  return handleMapRequest(request, async (input) => Response.json({ feature: await saveActivityMapFeature(input) }));
}

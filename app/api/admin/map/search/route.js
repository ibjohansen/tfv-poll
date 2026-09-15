import { handleMapRequest } from '@/lib/map/api';
import { searchMapData } from '@/lib/map/service';

export const runtime = 'nodejs';

export async function POST(request) {
  return handleMapRequest(request, async (input, _user, options) => Response.json(await searchMapData(input, options)));
}

import { handleMapRequest } from '@/lib/map/api';
import { importMapMembers } from '@/lib/map/member-import-service';

export const runtime = 'nodejs';

export async function POST(request) {
  return handleMapRequest(request, async (input) => Response.json(await importMapMembers(input)));
}

import { handleMapRequest } from '@/lib/map/api';
import { getMapHamlets, saveMapHamlet, syncMapHamletMembers } from '@/lib/map/hamlet-service';

export const runtime = 'nodejs';

export async function GET(request) {
  return handleMapRequest(request, async () => Response.json({ hamlets: await getMapHamlets() }), { readOnly: true });
}

export async function POST(request) {
  return handleMapRequest(request, async (input, _user, options) => input.action === 'sync_members'
    ? Response.json({ sync: await syncMapHamletMembers(input, options) })
    : Response.json({ hamlet: await saveMapHamlet(input) }));
}

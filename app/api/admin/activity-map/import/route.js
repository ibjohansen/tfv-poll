import { applyActivityImport, createActivityImportPreview, getActivityImportRuns, rejectActivityImportItems } from '@/lib/activity-map-import-service';
import { handleMapRequest } from '@/lib/map/api';
import { MapError } from '@/lib/map/errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request) {
  return handleMapRequest(request, async () => Response.json({ runs: await getActivityImportRuns() }), { readOnly: true });
}

export async function POST(request) {
  return handleMapRequest(request, async (input, _user, { signal }) => {
    if (input.action === 'preview') return Response.json({ run: await createActivityImportPreview(input, { signal }) });
    if (input.action === 'apply') return Response.json({ result: await applyActivityImport(input) });
    if (input.action === 'reject') return Response.json({ result: await rejectActivityImportItems(input) });
    throw new MapError('errors.activityImportAction');
  }, { timeoutMs: 60_000 });
}

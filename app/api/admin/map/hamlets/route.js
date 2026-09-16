import { after } from 'next/server';
import { handleMapRequest } from '@/lib/map/api';
import { getMapHamlets, saveMapHamlet } from '@/lib/map/hamlet-service';
import { dispatchHamletMemberSync } from '@/lib/map/hamlet-sync-background';
import { synchronizeMemberHamlets } from '@/lib/map/hamlet-member-sync';

export const runtime = 'nodejs';

export async function GET(request) {
  return handleMapRequest(request, async () => Response.json({ hamlets: await getMapHamlets() }), { readOnly: true });
}

export async function POST(request) {
  return handleMapRequest(request, async (input) => {
    const hamlet = await saveMapHamlet(input);
    if (!hamlet.reviewed || !hamlet.polygon) return Response.json({ hamlet, rematch: { status: 'not_required' } });
    const trigger = { hamletId: hamlet.id, polygonVersion: hamlet.version };
    if (process.env.NODE_ENV === 'production') {
      try {
        await dispatchHamletMemberSync(trigger, request.nextUrl.origin);
        return Response.json({ hamlet, rematch: { status: 'queued' } });
      } catch (error) {
        console.error('Hamlet member sync dispatch failed', {
          hamletId: hamlet.id, polygonVersion: hamlet.version, code: error.code, status: error.status,
          occurredAt: new Date().toISOString(),
        });
        return Response.json({ hamlet, rematch: { status: 'failed' } });
      }
    }
    after(async () => {
      try { await synchronizeMemberHamlets({ trigger }); }
      catch (error) {
        console.error('Hamlet member sync failed', {
          hamletId: hamlet.id, polygonVersion: hamlet.version, code: error.code,
          occurredAt: new Date().toISOString(),
        });
      }
    });
    return Response.json({ hamlet, rematch: { status: 'started' } });
  });
}

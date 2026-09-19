import { NextResponse } from 'next/server';
import { getAdminCmsPageRevisions } from '@/lib/cms-pages';
import { apiErrorStatus } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const revisions = await getAdminCmsPageRevisions((await params).id);
    return NextResponse.json({ ok: true, revisions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error.message === 'Unauthorized' ? 'Logg inn på nytt.' : 'Kunne ikke hente historikken.' }, { status: apiErrorStatus(error), headers: { 'Cache-Control': 'no-store' } });
  }
}

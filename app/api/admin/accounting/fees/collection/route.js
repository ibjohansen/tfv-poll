import { createCollectionCandidatesExport } from '@/lib/accounting-fees';
import { accountingFailure } from '@/lib/accounting-http';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const { t } = getRequestI18n(request, 'accounting');
    const result = await createCollectionCandidatesExport(new URL(request.url).searchParams.get('year'), t);
    return new Response(result.csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="inkassogrunnlag-${result.year}-${result.count}.csv"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return accountingFailure(error); }
}

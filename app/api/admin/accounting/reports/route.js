import { getAccountingReport } from '@/lib/accounting-report-data';
import { financePng } from '@/lib/annual-dues-documents';
import { accountingFailure } from '@/lib/accounting-http';
import { AccountingError } from '@/lib/accounting-validation';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
 try{
  const p=new URL(request.url).searchParams,kind=p.get('kind')||'result';
  if(!['result','balance','budget'].includes(kind))throw new AccountingError('invalidInput');
  const report=await getAccountingReport(p.get('year'));
  return new Response(await financePng(report,kind),{headers:{'Content-Type':'image/png',
   'Content-Disposition':`attachment; filename="${kind}-${kind==='balance'?2025:kind==='budget'?report.budget_year:report.year}.png"`,
   'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return accountingFailure(error);}
}

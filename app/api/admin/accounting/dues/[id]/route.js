import { getInvoiceFile } from '@/lib/annual-dues';
import { accountingFailure } from '@/lib/accounting-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,{params}){
  try{
    const file=await getInvoiceFile((await params).id,{credit:new URL(request.url).searchParams.get('credit')==='true'});
    return new Response(file.bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${file.number}.pdf"`,
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){return accountingFailure(error);}
}

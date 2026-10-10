import { accountingFailure, accountingResponse, accountingWriteRequest } from '@/lib/accounting-http';
import { closeFinanceYear, creditDuesInvoice, financeMutation, getFinanceOverview,
  issueDuesInvoice, openDuesCampaign, queueDuesInvoice, recordDuesPayment, issueDuesBatch, queueDuesBatch, getFinanceInvoiceSettings, saveFinanceInvoiceSettings } from '@/lib/annual-dues';
import { AccountingError } from '@/lib/accounting-validation';
import { dispatchAnnualDues } from '@/lib/annual-dues-background';
import { getDuesDeliveryDiagnostics } from '@/lib/annual-dues-diagnostics';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
  try{
    const params=new URL(request.url).searchParams,year=params.get('year'),memberId=params.get('member_id');
    if(memberId&&!/^\d{1,18}$/.test(memberId))throw new AccountingError('invalidInput');
    if(params.get('diagnostics')==='delivery')return accountingResponse({ok:true,data:await getDuesDeliveryDiagnostics(year,{signal:request.signal})});
    const data=params.get('settings')==='invoice'?await getFinanceInvoiceSettings():await getFinanceOverview(year,{memberId});
    return accountingResponse({ok:true,data});
  }catch(error){return accountingFailure(error);}
}
export async function POST(request){
  try{
    const input=await accountingWriteRequest(request);
    const operations={campaign:openDuesCampaign,issue:issueDuesInvoice,queue:queueDuesInvoice,
      payment:recordDuesPayment,credit:creditDuesInvoice,close:closeFinanceYear,issue_batch:issueDuesBatch,queue_batch:queueDuesBatch,invoice_settings:saveFinanceInvoiceSettings};
    if(!Object.hasOwn(operations,input.operation))throw new AccountingError('invalidInput');
    const result=await financeMutation(()=>operations[input.operation](input));
    if(input.operation==='queue'||input.operation==='queue_batch'){
      try{await dispatchAnnualDues(new URL(request.url).origin);}catch{console.warn('Annual dues dispatch deferred');}
    }
    return accountingResponse({ok:true,result});
  }catch(error){return accountingFailure(error);}
}

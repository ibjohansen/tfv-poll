import { accountingFailure, accountingResponse, accountingWriteRequest } from '@/lib/accounting-http';
import { closeFinanceYear, creditDuesInvoice, financeMutation, getFinanceOverview,
  issueDuesInvoice, openDuesCampaign, queueDuesInvoice, recordDuesPayment, prepareDuesRecipient, issueDuesBatch, queueDuesBatch } from '@/lib/annual-dues';
import { AccountingError } from '@/lib/accounting-validation';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
  try{
    const params=new URL(request.url).searchParams,year=params.get('year'),memberId=params.get('member_id');
    if(memberId&&!/^\d{1,18}$/.test(memberId))throw new AccountingError('invalidInput');
    const data=await getFinanceOverview(year,{memberId});
    return accountingResponse({ok:true,data});
  }catch(error){return accountingFailure(error);}
}
export async function POST(request){
  try{
    const input=await accountingWriteRequest(request);
    const operations={campaign:openDuesCampaign,issue:issueDuesInvoice,queue:queueDuesInvoice,
      payment:recordDuesPayment,credit:creditDuesInvoice,close:closeFinanceYear,prepare:prepareDuesRecipient,issue_batch:issueDuesBatch,queue_batch:queueDuesBatch};
    if(!Object.hasOwn(operations,input.operation))throw new AccountingError('invalidInput');
    const result=await financeMutation(()=>operations[input.operation](input));
    return accountingResponse({ok:true,result});
  }catch(error){return accountingFailure(error);}
}

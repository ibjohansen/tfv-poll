import { trustedJobOrigin } from './request-origin.js';
import { annualDuesSendingEnabled } from './annual-dues-sending.js';
export async function dispatchAnnualDues(origin,options={}){
 const env=options.env||process.env,secret=env.MAILERSEND_JOB_SECRET;
 if(!annualDuesSendingEnabled(env)||typeof secret!=='string'||secret.length<32)throw new Error('JOB_NOT_CONFIGURED');
 const url=new URL('/.netlify/functions/annual-dues-background',trustedJobOrigin(origin,env));
 const response=await (options.fetchImpl||fetch)(url,{method:'POST',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10_000),
  headers:{'Content-Type':'application/json','X-MailerSend-Job-Secret':secret},body:'{}'});
 if(response.status!==202||response.redirected)throw new Error('JOB_DISPATCH_REJECTED');
}

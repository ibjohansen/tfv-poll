import { timingSafeEqual } from 'node:crypto';
import { processAnnualDues } from '../../lib/annual-dues-worker.js';
export default async function handler(request,context){
 const expected=Buffer.from(process.env.MAILERSEND_JOB_SECRET||''),received=Buffer.from(request.headers.get('x-mailersend-job-secret')||'');
 if(expected.length<32||expected.length!==received.length||!timingSafeEqual(expected,received))return new Response(null,{status:403});
 if(context?.deploy?.context!=='production'||process.env.APP_ENVIRONMENT!=='production'||process.env.NETLIFY_LOCAL==='true'||process.env.INVOICE_EMAIL_ENABLED!=='true')return new Response(null,{status:403});
 if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
 try{await processAnnualDues();}catch{throw new Error('Annual dues background failed');}
 return new Response(null,{status:204});
}
export const config={background:true};

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, plain } from './helpers/load-module.mjs';
import * as mailer from '../lib/mailer-service.js';
import { mailFailureDetails } from '../lib/mail-failure-log.js';
import { accountingYear } from '../lib/accounting-validation.js';
import { invoiceDeliveryIssues, suppressionExplanation } from '../lib/annual-dues-delivery.js';

async function diagnosticApi({rows=[],allowed=true}={}){
 const calls=[];
 const sql=(strings,...values)=>{calls.push({query:strings.join('?'),values});return Promise.resolve(rows);};
 const api=await loadModule('lib/annual-dues-diagnostics.js',{
  './db.js':{getSql:()=>sql},'./admin-access.js':{requirePermission:async p=>{assert.equal(p,'read');if(!allowed)throw new Error('Forbidden');}},
  './accounting-validation.js':{accountingYear},'./mock-store.js':{isMockMode:()=>false},'./mailer-service.js':mailer,'./mail-failure-log.js':{mailFailureDetails},
 });
 return {api,calls};
}

test('delivery diagnostics preserve all suppression details when recipient history is denied',async()=>{
 const {api,calls}=await diagnosticApi({rows:[{id:'d1',recipient_email:'a@example.test',local_reason:null},{id:'d2',recipient_email:'b@example.test',local_reason:'provider-webhook'}]});
 let historyCalls=0;
 const data=await api.getDuesDeliveryDiagnostics('2026',{
  env:{},getSuppressions:async()=>({details:new Map([['a@example.test',[{type:'hard-bounces',recipient_id:'r1',reason:'Mailbox unavailable',created_at:'2026-09-18T16:36:57Z'}]],['b@example.test',[{type:'hard-bounces',recipient_id:'r2',reason:'Unknown reason'}]]])}),
  getRecipientDiagnostics:async()=>{historyCalls++;throw new mailer.MailerServiceError('RECIPIENT_HISTORY_UNAVAILABLE','UPSTREAM',502,{providerStatus:403});},
 });
 assert.equal(data.deliveries.d1.suppression_reasons[0].reason,'Mailbox unavailable');assert.equal(data.deliveries.d2.suppression_reasons[0].reason,'Unknown reason');
 assert.equal(data.deliveries.d2.local_suppression_reason,'provider-webhook');assert.equal(data.deliveries.d2.lookup_complete,true);
 assert.equal(data.limitations[0].http_status,403);assert.equal(data.limitations[0].operation,'recipient_history');assert.equal(historyCalls,1);
 assert.equal(calls.length,1);assert.match(calls[0].query,/WHERE i.year=/);assert.deepEqual(plain(calls[0].values),[2026]);assert.doesNotMatch(calls[0].query,/UPDATE|INSERT|DELETE/);
});

test('unavailable suppression lookup remains explicit and does not claim the address is clear',async()=>{
 const {api}=await diagnosticApi({rows:[{id:'d1',recipient_email:'a@example.test',local_reason:'known-local-reason'}]});
 const data=await api.getDuesDeliveryDiagnostics(2026,{env:{},getSuppressions:async()=>{throw new mailer.MailerServiceError('Limit','MAILERSEND_RATE_LIMIT',429,{providerStatus:429,retryAt:'2026-10-11T00:00:00Z'});}});
 assert.equal(data.deliveries.d1.lookup_complete,false);assert.equal(data.deliveries.d1.local_suppression_reason,'known-local-reason');
 assert.equal(data.limitations[0].http_status,429);assert.equal(data.limitations[0].retry_at,'2026-10-11T00:00:00Z');
});

test('diagnostic authorization runs before database/provider access and empty selections never contact MailerSend',async()=>{
 const denied=await diagnosticApi({allowed:false});await assert.rejects(denied.api.getDuesDeliveryDiagnostics(2026),/Forbidden/);assert.equal(denied.calls.length,0);
 const {api}=await diagnosticApi();assert.deepEqual(plain((await api.getDuesDeliveryDiagnostics(2026,{getSuppressions:()=>assert.fail('empty selection')})).deliveries),{});
});

test('current delivery issues exclude credited and subsequently successful attempts but preserve selectable history',()=>{
 const invoices=[
  {id:'failed',deliveries:[{id:'f',status:'bounced'}]},
  {id:'resolved',deliveries:[{id:'old',status:'failed'},{id:'success',status:'sent'}]},
  {id:'credited',credit_number:'CR-1',deliveries:[{id:'c',status:'suppressed'}]},
  {id:'retry',deliveries:[{id:'r',status:'pending',failure_reason:'MAILERSEND_RATE_LIMIT'}]},
  {id:'delayed',deliveries:[{id:'d',status:'sent',detail:{delayed:true}}]},
  {id:'delivered',deliveries:[{id:'done',status:'delivered',detail:{delayed:true}}]},
 ];
 assert.deepEqual(invoiceDeliveryIssues(invoices).map(i=>i.invoice.id),['failed','retry','delayed']);
 const history=invoiceDeliveryIssues(invoices,{includeHistory:true});assert.deepEqual(history.map(i=>i.invoice.id),['failed','resolved','credited','retry','delayed']);
 assert.equal(history.find(i=>i.invoice.id==='resolved').resolved,true);assert.equal(history.find(i=>i.invoice.id==='credited').resolved,true);
 assert.match(suppressionExplanation({type:'hard-bounces',reason:'Unknown reason'}),/ikke oppgitt en mer konkret årsak/);
});

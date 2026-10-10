import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {PDFDocument} from 'pdf-lib';
import * as documents from '../lib/annual-dues-documents.js';
import * as validation from '../lib/annual-dues-validation.js';
import * as accountingValidation from '../lib/accounting-validation.js';
import {processMailerSendEvent} from '../lib/mailersend-webhook.js';
import {loadModule,plain} from './helpers/load-module.mjs';

const db=new PGlite({extensions:{pg_trgm}}),uuid=()=>crypto.randomUUID().replaceAll('-','');
function query(text,values=[]){let promise;return {text,values,then(resolve,reject){promise??=db.query(text,values).then(r=>r.rows);return promise.then(resolve,reject);}};}
function sql(strings,...values){return query(strings.reduce((s,part,i)=>s+(i?`$${i}`:'')+part,''),values);}
sql.query=query;sql.transaction=queries=>db.transaction(async tx=>{const out=[];for(const q of queries)out.push((await tx.query(q.text,q.values)).rows);return out;});
const env={INVOICE_EMAIL_ENABLED:'true',APP_ENVIRONMENT:'production',TOKEN_AUDIENCE:'synthetic-dues',SECURITY_EVENT_HMAC_KEY:'x'.repeat(32),MAILERSEND_ENABLED:'true',MAILERSEND_BULK_ENABLED:'true',MAILERSEND_API_TOKEN:'synthetic',MAILERSEND_DOMAIN_ID:'synthetic',MAILERSEND_FROM_EMAIL:'post@turufjellvel.no'};
let api,worker,member,invoice,denied=false;
const campaign=year=>({year,amount:'250',prefix:`AK-${year}-`,first_number:1,sender_address:'Eksempelvegen 1, 0000 Eksempel',bank_account:'86011117947',reply_to:'post@turufjellvel.no',reviewed:true});
const payment=(i,values={})=>({id:uuid(),invoice_id:i.id,payment_year:2026,date:'2026-02-15',amount:'100',reference:uuid(),evidence:'Syntetisk bankbilag',...values});

before(async()=>{
 await db.exec(await readFile(new URL('../database/schema.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../database/annual-dues.sql',import.meta.url),'utf8'));
 const dependencies={'node:crypto':crypto,'./db.js':{getSql:()=>sql},'./admin-access.js':{requirePermission:async permission=>{if(denied&&permission!=='read')throw new Error('Forbidden');return {email:'accountant@example.test'};}},
  './mock-store.js':{isMockMode:()=>false},'./accounting-validation.js':accountingValidation,'./annual-dues-validation.js':validation,
  './annual-dues-documents.js':documents,'./survey-email-background.js':{getSurveyEmailBackgroundStatus:()=> 'ready'},
  './mailer-service.js':{isMailerSendConfigured:()=>true,isMailerSendBulkEnabled:()=>true}};
 api=await loadModule('lib/annual-dues.js',dependencies,{process:{env}});
 const [{assertDatabaseEnvironment},{mailFailureDetails},mailer]=await Promise.all([import('../lib/security-config.js'),import('../lib/mail-failure-log.js'),import('../lib/mailer-service.js')]);
 worker=await loadModule('lib/annual-dues-worker.js',{'./db.js':{getSql:()=>sql},'./security-config.js':{assertDatabaseEnvironment},'./annual-dues-email.js':documents,'./mail-failure-log.js':{mailFailureDetails},'./mailer-service.js':mailer});
 await sql`INSERT INTO accounting_years(id,annual_fee_ore,member_count,budget,actual_income) VALUES(2026,25000,1,'{"dues":25000}','{}'),(2025,25000,1,'{}','{}'),(2024,25000,1,'{}','{}')`;
 [member]=await sql`INSERT INTO members(h_number,street_address,title_holder,primary_contact_name,primary_contact_email,membership_status,registration_date)
  VALUES('DEMO-101','Eksempelvegen 10','Eksempelmedlem','Eksempelmedlem','member@example.test','member','2025-10-10') RETURNING id::text,h_number`;
});
after(async()=>db.close());
const issue=(id,extra={})=>({id:uuid(),year:2026,member_id:id,date:'2026-02-02',recipient_name:'Eksempelmedlem',invoice_address:'Eksempelgata 9, 0000 Eksempel',reviewed:true,...extra});
test('campaign is unique and leaves manual accounts and historic balance untouched',async()=>{
 const before=plain(await sql`SELECT annual_fee_ore,budget,actual_income FROM accounting_years WHERE id=2026`);
 await api.openDuesCampaign(campaign(2026));await assert.rejects(api.openDuesCampaign(campaign(2026)),/campaignExists/);
 invoice=await api.issueDuesInvoice(issue(member.id));assert.equal(invoice.number,'AK-2026-1');
 await assert.rejects(api.issueDuesInvoice(issue(member.id)),e=>e.code==='23505');
 assert.deepEqual(plain(await sql`SELECT annual_fee_ore,budget,actual_income FROM accounting_years WHERE id=2026`),before);
 assert.equal((await sql`SELECT tablename FROM pg_tables WHERE tablename LIKE 'finance_%'`).length,0);
 await assert.rejects(async()=>await sql`UPDATE annual_dues_invoices SET amount_ore=1 WHERE id=${invoice.id}`,/immutableFinanceRecord/);
});
test('February 1 is inclusive; later dates, unknown and conflicting dates are held',async()=>{
 for(const [date,status] of [['2026-02-01','eligible'],['2026-02-02','after_cutoff'],['2027-01-01','after_cutoff'],[null,'review'],['2026-02-30','review'],['2025-01-01 / 2026-02-02','review'],['2025-01-01 / 2026-02-01','eligible']]){
  assert.equal((await sql`SELECT annual_dues_eligibility(${date},2026) AS status`)[0].status,status);
 }
 for(const [number,date] of [['AFTER','2026-02-02'],['UNKNOWN',null],['BOUNDARY','2026-02-01']])await sql`INSERT INTO members(h_number,title_holder,primary_contact_email,registration_date) VALUES(${number},'Test',${number.toLowerCase()+'@example.test'},${date})`;
 const overview=await api.getFinanceOverview(2026);assert.equal(overview.excluded.length,2);assert.equal(overview.candidates.length,1);
 for(const m of overview.excluded)await assert.rejects(api.issueDuesInvoice(issue(m.id)),/ownershipDateExcluded/);
 await assert.rejects(api.issueDuesInvoice(issue(overview.candidates[0].id,{date:'2026-01-31'})),/beforeCutoff/);
});
test('prepared batch issuance is idempotent and includes only eligible properties',async()=>{
 const overview=await api.getFinanceOverview(2026),m=overview.candidates[0];
 await api.prepareDuesRecipient({member_id:m.id,recipient_name:'Grunnbok Test',invoice_address:'Eksempelgata 10',title_holder:m.title_holder,reviewed:true});
 const input={batch_id:uuid(),year:2026,date:'2026-02-02',member_ids:[m.id,overview.excluded[0].id],reviewed:true};
 let result=await api.issueDuesBatch(input);assert.equal(result.results[0].ok,true);assert.equal(result.results[1].ok,false);
 result=await api.issueDuesBatch(input);assert.equal(result.results[0].ok,true);assert.equal((await api.getFinanceOverview(2026)).invoices.length,2);
});
test('partial payments, idempotency, overpayments and corrections retain evidence',async()=>{
 const first=payment(invoice);await api.recordDuesPayment(first);await api.recordDuesPayment(first);
 assert.equal((await api.getFinanceOverview(2026)).invoices[0].paid_ore,10000);
 await assert.rejects(api.recordDuesPayment({...first,id:uuid()}),e=>e.code==='23505');
 await assert.rejects(api.recordDuesPayment(payment(invoice,{amount:'151'})),/overpayment/);
 await api.recordDuesPayment(payment(invoice,{amount:'150'}));
 assert.equal((await sql`SELECT paid FROM member_annual_fees WHERE member_id=${member.id}::bigint AND fee_year=2026`)[0].paid,true);
 await api.recordDuesPayment(payment(invoice,{amount:'100',reverses_id:first.id}));
 assert.equal((await api.getFinanceOverview(2026)).invoices[0].paid_ore,15000);
 await assert.rejects(async()=>await sql`UPDATE member_annual_fees SET paid=TRUE WHERE member_id=${member.id}::bigint AND fee_year=2026`,/useDocumentedPayments/);
});
test('primary email copies preserve the archived claim and pending attempts prevent closing',async()=>{
 await sql`SELECT annual_dues_queue(${uuid()},${invoice.id},'member@example.test','test',FALSE)`;
 await assert.rejects(async()=>await sql`SELECT annual_dues_queue(${uuid()},${invoice.id},'member@example.test','test',FALSE)`,/deliveryPending/);
 await assert.rejects(api.closeFinanceYear({year:2026,reviewed:true,evidence:'test'}),/deliveryPending/);
 await sql`UPDATE email_deliveries SET status='failed' WHERE invoice_id=${invoice.id}`;
 await sql`UPDATE members SET primary_contact_email='new@example.test' WHERE id=${member.id}::bigint`;
 await sql`SELECT annual_dues_queue(${uuid()},${invoice.id},'new@example.test','test',FALSE)`;
 const i=(await api.getFinanceOverview(2026)).invoices[0];assert.deepEqual(plain(i.deliveries.map(d=>d.recipient)),['member@example.test','new@example.test']);assert.equal(i.snapshot.source_email,'member@example.test');
});
test('mail is off by default; simulated worker sends archived PDF once and includes exact bylaws before greeting',async()=>{
 assert.deepEqual(plain(await worker.processAnnualDues({env:{}})),{disabled:true});
 await sql`INSERT INTO application_environment(singleton,environment) VALUES(TRUE,'production') ON CONFLICT(singleton) DO UPDATE SET environment='production'`;
 const options={env,sql,delayMs:0,getSuppressions:async()=>({emails:new Set(),domains:new Set()})};let sent=0;
 const result=await worker.processAnnualDues({...options,sendEmail:async message=>{
  sent++;assert.equal(message.to,'new@example.test');assert.equal(message.attachments[0].filename,invoice.number+'.pdf');
  const pdf=await PDFDocument.load(Buffer.from(message.attachments[0].content,'base64'));assert.equal(pdf.getPageCount(),1);
  assert.ok(message.text.endsWith(documents.annualDuesBylaws+'\n\nVennlig hilsen\nTurufjell Vel'));assert.doesNotMatch(message.text,/Velavgift|inkasso/i);
  return {messageId:'provider-invoice-1'};
 }});assert.equal(result.sent,1);assert.equal(sent,1);
 await worker.processAnnualDues({...options,sendEmail:async()=>assert.fail('duplicate send')});
 const event={type:'activity.hard_bounced',created_at:'2026-02-15T12:00:00Z',data:{id:'bounce-test',message_id:'provider-invoice-1',meta:{bounce_code:550,bounce_reason:'550 5.1.1 Mailbox does not exist',bounce_type:'hard'}}};
 assert.equal((await processMailerSendEvent(event,{sql})).outcome,'updated');assert.equal((await processMailerSendEvent(event,{sql})).outcome,'duplicate');
 await processMailerSendEvent({type:'activity.sent',data:{id:'late-sent',message_id:'provider-invoice-1'}},{sql});
 const last=(await api.getFinanceOverview(2026)).invoices[0].deliveries.at(-1);assert.equal(last.status,'bounced');assert.equal(last.events.length,2);assert.equal(last.events[0].detail.enhanced_code,'5.1.1');
});
test('queued invoices are blocked if the owner becomes ineligible before the worker runs',async()=>{
 const i=(await api.getFinanceOverview(2026)).invoices[1];
 await sql`SELECT annual_dues_queue(${uuid()},${i.id},'boundary@example.test','test',FALSE)`;
 await sql`UPDATE members SET registration_date='2026-02-02' WHERE id=${i.member_id}::bigint`;
 await worker.processAnnualDues({env,sql,delayMs:0,getSuppressions:async()=>({emails:new Set(),domains:new Set()}),sendEmail:async()=>assert.fail('ineligible recipient')});
 assert.equal((await sql`SELECT failure_reason FROM email_deliveries WHERE invoice_id=${i.id}`)[0].failure_reason,'MEMBER_CHANGED');
 await assert.rejects(async()=>await sql`SELECT annual_dues_queue(${uuid()},${i.id},'boundary@example.test','test',TRUE)`,/ownershipDateExcluded/);
});
test('credit notes preserve the original and replacement does not duplicate an active claim',async()=>{
 const [m]=await sql`INSERT INTO members(h_number,title_holder,primary_contact_email,registration_date) VALUES('REPLACE','Test','replace@example.test','2025-01-01') RETURNING id::text`;
 const input=issue(m.id),original=await api.issueDuesInvoice(input);
 await api.creditDuesInvoice({year:2026,invoice_id:original.id,date:'2026-02-03',reason:'Feil fakturaadresse'});
 const replacement=await api.issueDuesInvoice({...input,id:uuid(),replaces_id:original.id,invoice_address:'Ny gate 2'});
 const overview=await api.getFinanceOverview(2026);assert.equal(overview.invoices.find(i=>i.id===original.id).credit_number,'AK-2026-4');assert.equal(replacement.number,'AK-2026-5');
 const file=await api.getInvoiceFile(original.id,{credit:true});assert.equal((await PDFDocument.load(file.bytes)).getPageCount(),1);
});
test('read access cannot mutate claims and sending requires separate environment activation',async()=>{
 denied=true;assert.equal((await api.getFinanceOverview(2026)).installed,true);
 await assert.rejects(api.openDuesCampaign(campaign(2025)),/Forbidden/);denied=false;
 assert.equal(api.invoiceSendingEnabled({INVOICE_EMAIL_ENABLED:'false'}),false);
});
test('formal closure locks invoicing and preserves historical claims and manual account values',async()=>{
 const before=plain(await sql`SELECT budget,actual_income FROM accounting_years WHERE id=2026`);
 await api.closeFinanceYear({year:2026,reviewed:true,evidence:'Syntetisk vedtak om årsavslutning'});
 assert.equal((await api.getFinanceOverview(2026)).yearClosed,true);
 await assert.rejects(api.issueDuesInvoice(issue(member.id)),/financeYearClosed/);
 await assert.rejects(async()=>await sql`SELECT annual_dues_queue(${uuid()},${invoice.id},'new@example.test','test',FALSE)`,/financeYearClosed/);
 assert.deepEqual(plain(await sql`SELECT budget,actual_income FROM accounting_years WHERE id=2026`),before);
});
test('full schema reapplication preserves invoice PDFs, payment evidence and mail history',async()=>{
 const before=plain(await api.getFinanceOverview(2026));await db.exec(await readFile(new URL('../database/schema.sql',import.meta.url),'utf8'));assert.deepEqual(plain(await api.getFinanceOverview(2026)),before);
});
test('known rate limits retry safely; unknown provider acceptance and early bounces require follow-up',async()=>{
 await api.openDuesCampaign(campaign(2025));
 const [m]=await sql`INSERT INTO members(h_number,title_holder,primary_contact_email,registration_date) VALUES('RETRY','Test','retry@example.test','2024-01-01') RETURNING id::text`;
 const retry=await api.issueDuesInvoice(issue(m.id,{year:2025,date:'2025-02-02'}));
 await sql`SELECT annual_dues_queue(${uuid()},${retry.id},'retry@example.test','test',FALSE)`;
 const options={env,sql,delayMs:0,getSuppressions:async()=>({emails:new Set(),domains:new Set()})};
 await worker.processAnnualDues({...options,sendEmail:async()=>{const e=new Error('rate limit');e.code='MAILERSEND_RATE_LIMIT';e.providerStatus=429;throw e;}});
 let [attempt]=await sql`SELECT status,invoice_attempt_count,invoice_retry_at FROM email_deliveries WHERE invoice_id=${retry.id}`;assert.equal(attempt.status,'pending');assert.equal(attempt.invoice_attempt_count,1);assert.ok(attempt.invoice_retry_at);
 await sql`UPDATE email_deliveries SET invoice_retry_at=NOW()-INTERVAL '1 second' WHERE invoice_id=${retry.id}`;
 await worker.processAnnualDues({...options,sendEmail:async()=>{throw new Error('unknown acceptance');}});
 [attempt]=await sql`SELECT status FROM email_deliveries WHERE invoice_id=${retry.id}`;assert.equal(attempt.status,'failed');
 await worker.processAnnualDues({...options,sendEmail:async()=>assert.fail('unknown acceptance must not auto-resend')});
 await sql`SELECT annual_dues_queue(${uuid()},${retry.id},'retry@example.test','test',FALSE)`;
 await worker.processAnnualDues({...options,sendEmail:async()=>{
  assert.equal((await processMailerSendEvent({type:'activity.hard_bounced',data:{id:'early-bounce',message_id:'early-provider',meta:{bounce_reason:'550 5.1.1 Not found'}}},{sql})).outcome,'unknown');return {messageId:'early-provider'};
 }});
 const latest=(await api.getFinanceOverview(2025)).invoices.find(i=>i.id===retry.id).deliveries.at(-1);assert.equal(latest.status,'bounced');assert.equal(latest.detail.enhanced_code,'5.1.1');assert.ok(latest.failed_at);
 assert.equal((await sql`SELECT recipient_email FROM email_suppressions WHERE recipient_email='retry@example.test'`).length,1);
});
test('report images preserve the published balance and distinguish unknown income from zero',async()=>{
 const data=await import('../data/accounting.js');
 const reports=await loadModule('lib/accounting-report-data.js',{'./accounting.js':{getAccountingOverview:async year=>({year,settings:accountingValidation.proposeAccountingYear(year,411),expenses:[]})},'../data/accounting.js':data,'./accounting-validation.js':accountingValidation});
 const historical=await reports.getAccountingReport(2025),current=await reports.getAccountingReport(2026);
 assert.equal(historical.result_ore,4078269);assert.equal(historical.assets_ore,4963685);assert.equal(current.assets_ore,4963685);assert.equal(current.income_ore,null);assert.equal(current.result_ore,null);
 for(const kind of ['result','balance','budget'])assert.equal((await documents.financePng(historical,kind)).subarray(1,4).toString(),'PNG');
});
test('an open prior-year campaign accepts the actual issue date in the following year',async()=>{
 const [m]=await sql`INSERT INTO members(h_number,title_holder,primary_contact_email,registration_date) VALUES('LATE','Test','late@example.test','2024-01-01') RETURNING id::text`;
 const late=await api.issueDuesInvoice(issue(m.id,{year:2025,date:'2026-02-02'}));
 const i=(await api.getFinanceOverview(2025)).invoices.find(i=>i.id===late.id);
 assert.equal(i.issued_on,'2026-02-02');assert.equal(i.due_on,'2026-02-16');assert.equal(i.number.startsWith('AK-2025-'),true);
 await assert.rejects(api.issueDuesInvoice(issue(m.id,{year:2025,date:'2099-02-02'})),/invalidDate/);
});

import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { getSql } from './db.js';
import { requirePermission } from './admin-access.js';
import { isMockMode } from './mock-store.js';
import { AccountingError, accountingId, accountingYear } from './accounting-validation.js';
import { campaignInput, invoiceIssueDate, financeText, invoiceEmail, paymentInput, invoiceSettingsInput } from './annual-dues-validation.js';
import { annualDuesBylaws, invoicePdf } from './annual-dues-documents.js';
import { getSurveyEmailBackgroundStatus } from './survey-email-background.js';
import { isMailerSendConfigured, isMailerSendBulkEnabled } from './mailer-service.js';
import { invoiceSenderDefaults } from './invoice-sender-defaults.js';
import { annualDuesSendingEnabled, annualDuesSendingMode, annualDuesTestMemberIds } from './annual-dues-sending.js';

const uuid=()=>randomUUID().replaceAll('-','');
export function invoiceSendingEnabled(env=process.env) {
  return annualDuesSendingEnabled(env)&&isMailerSendConfigured(env)&&isMailerSendBulkEnabled(env)&&getSurveyEmailBackgroundStatus(env)==='ready';
}
async function writeActor(){
  const user=await requirePermission('members');
  if(isMockMode())throw new AccountingError('mock',409);
  return user.email.toLowerCase();
}
export async function financeMutation(callback){
  try{return await callback();}
  catch(error){
    if(error.code==='P0001')throw new AccountingError(String(error.message).split('\n')[0],409);
    if(error.code==='23505')throw new AccountingError('conflict',409);
    throw error;
  }
}
const emptyInvoiceSettings=()=>({...invoiceSenderDefaults,version:0});
async function readInvoiceSettings(sql=getSql()){
  const [settings]=await sql`SELECT sender_address,bank_account,version,contact FROM finance_invoice_settings WHERE singleton=TRUE`;
  return settings?{...invoiceSenderDefaults,...settings.contact,sender_address:settings.sender_address,bank_account:settings.bank_account||'',version:settings.version}:emptyInvoiceSettings();
}
export async function getFinanceInvoiceSettings(){
  await requirePermission('read');
  if(isMockMode())return emptyInvoiceSettings();
  return readInvoiceSettings();
}
export async function saveFinanceInvoiceSettings(input){
  const actor=await writeActor(),settings=invoiceSettingsInput(input),sql=getSql();
  await sql`SELECT finance_invoice_settings_save(${settings.version},${settings.sender_address},${settings.bank_account},${JSON.stringify(settings.contact)}::jsonb,${actor})`;
  return readInvoiceSettings(sql);
}
async function reviewedInvoiceSettings(input,sql){
  const settings=await readInvoiceSettings(sql);
  if(!settings.version||!settings.bank_account)throw new AccountingError('invoiceSettingsRequired',409);
  if(input.invoice_settings_version!==settings.version)throw new AccountingError('invoiceSettingsChanged',409);
  return settings;
}
function senderFromSettings(settings,vat='Årskontingent unntatt merverdiavgift'){
  return {name:settings.name,organization_number:settings.organization_number,phone:settings.phone,reply_to:settings.reply_to,website:settings.website,
    address:settings.sender_address,bank_account:settings.bank_account,settings_version:settings.version,vat};
}
export async function getFinanceOverview(value,{memberId=null}={}){
  await requirePermission('read');const year=accountingYear(value);
  const sendingMode=invoiceSendingEnabled()?annualDuesSendingMode():'off',testMemberIds=annualDuesTestMemberIds();
  const empty={year,installed:false,yearClosed:false,campaign:null,invoices:[],candidates:[],excluded:[],sendingEnabled:sendingMode!=='off',sendingMode,invoiceSettings:emptyInvoiceSettings()};
  if(isMockMode())return empty;
  const sql=getSql();
  try{
    const [settings,campaign,invoices,candidates,invoiceSettings]=await Promise.all([
      sql`SELECT closed_at FROM accounting_years WHERE id=${year}`,
      sql`SELECT year,amount_ore::float8,sender,tax_treatment,number_prefix,next_number,closed_at FROM annual_dues_campaigns WHERE year=${year}`,
      sql`SELECT i.id,i.member_id::text,i.number,i.issued_on::text,i.due_on::text,i.amount_ore::float8,i.snapshot,
        cr.number AS credit_number,
        coalesce((SELECT sum(CASE WHEN p.reverses_id IS NULL THEN p.amount_ore ELSE -p.amount_ore END) FROM annual_dues_payments p WHERE p.invoice_id=i.id),0)::float8 AS paid_ore,
        coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'date',p.paid_on,'year',p.year,'amount_ore',p.amount_ore,'reference',p.reference,'evidence',p.evidence,'reverses_id',p.reverses_id) ORDER BY p.created_at,p.id) FROM annual_dues_payments p WHERE p.invoice_id=i.id),'[]'::jsonb) AS payments,
        coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'attempt',d.invoice_attempt,'attempt_count',d.invoice_attempt_count,'retry_at',d.invoice_retry_at,'subject',d.subject,'recipient',d.recipient_email,'status',d.status,'queued_at',d.created_at,'sent_at',d.sent_at,'delivered_at',d.delivered_at,'failed_at',d.failed_at,'failure_reason',d.failure_reason,'detail',d.delivery_detail,'provider_message_id',d.provider_message_id,
          'events',coalesce((SELECT jsonb_agg(jsonb_build_object('type',e.event_type,'occurred_at',e.occurred_at,'received_at',e.created_at,'detail',e.detail) ORDER BY e.occurred_at,e.created_at) FROM email_webhook_events e WHERE e.provider_message_id=d.provider_message_id),'[]'::jsonb)) ORDER BY d.invoice_attempt) FROM email_deliveries d WHERE d.invoice_id=i.id),'[]'::jsonb) AS deliveries,
        m.primary_contact_email AS current_email,m.title_holder AS current_title_holder,m.deleted_at AS member_deleted_at,
        annual_dues_eligibility(m.registration_date,i.year) AS eligibility,m.registration_date AS current_registration_date
        FROM annual_dues_invoices i LEFT JOIN annual_dues_credits cr ON cr.invoice_id=i.id LEFT JOIN members m ON m.id=i.member_id
        WHERE i.year=${year} AND (${memberId}::bigint IS NULL OR i.member_id=${memberId}::bigint) ORDER BY i.number`,
      memberId?Promise.resolve([]):sql`SELECT m.id::text,m.h_number,m.street_address,m.primary_contact_name,m.primary_contact_email,m.title_holder,m.registration_date,annual_dues_eligibility(m.registration_date,${year}) AS eligibility,
        EXISTS(SELECT 1 FROM annual_dues_invoices i WHERE i.member_id=m.id AND i.year=${year} AND NOT EXISTS(SELECT 1 FROM annual_dues_credits cr WHERE cr.invoice_id=i.id)) AS has_active_invoice,
        (SELECT i.id FROM annual_dues_invoices i JOIN annual_dues_credits cr ON cr.invoice_id=i.id WHERE i.year=${year} AND i.member_id=m.id ORDER BY i.created_at DESC LIMIT 1) AS replaces_id
        FROM members m WHERE m.deleted_at IS NULL AND m.membership_status='member' ORDER BY m.h_number,m.id`,
      readInvoiceSettings(sql),
    ]);
    const isTestTarget=item=>testMemberIds.has(String(item.member_id||item.id));
    return {...empty,installed:true,yearClosed:Boolean(settings[0]?.closed_at),campaign:campaign[0]||null,invoices:invoices.map(item=>({...item,is_test_target:isTestTarget(item)})),candidates:candidates.filter(m=>m.eligibility==='eligible'&&!m.has_active_invoice).map(item=>({...item,is_test_target:isTestTarget(item)})),excluded:candidates.filter(m=>m.eligibility!=='eligible'),invoiceSettings};
  }catch(error){if(error.code==='42P01'||error.code==='42703')return empty;throw error;}
}
export async function openDuesCampaign(input){
  const actor=await writeActor(),sql=getSql(),settings=await reviewedInvoiceSettings(input,sql);
  const c=campaignInput({...input,bank_account:settings.bank_account,sender_address:settings.sender_address,reply_to:settings.reply_to});
  c.sender=senderFromSettings(settings);
  await sql`SELECT annual_dues_open(${c.year},${c.amount},${JSON.stringify(c.sender)}::jsonb,${c.prefix},${c.first},${actor})`;
  return {year:c.year};
}
export async function issueDuesInvoice(input){
  const actor=await writeActor(), year=accountingYear(input.year), issued=invoiceIssueDate(input.date,year);
  if(!/^\d{1,18}$/.test(String(input.member_id)))throw new AccountingError('invalidInput');
  const sql=getSql(),settings=await reviewedInvoiceSettings(input,sql), [campaign]=await sql`SELECT * FROM annual_dues_campaigns WHERE year=${year}`;
  const [member]=await sql`SELECT id::text,h_number,street_address,cadastral_number,title_holder,primary_contact_name,primary_contact_email,registration_date FROM members WHERE id=${input.member_id}::bigint AND deleted_at IS NULL AND membership_status='member'`;
  if(!campaign || !member)throw new AccountingError('memberChanged',409);
  for(const key of ['h_number','street_address','title_holder'])if(input[key]!==undefined&&input[key]!==member[key])throw new AccountingError('memberChanged',409);
  const due=new Date(`${issued}T12:00:00Z`);due.setUTCDate(due.getUTCDate()+14);
  const email=invoiceEmail(member.primary_contact_email),recipient=financeText(member.title_holder||member.primary_contact_name,160);
  const snapshot={h_number:member.h_number,street_address:member.street_address,cadastral_number:member.cadastral_number,title_holder:member.title_holder,registration_date:member.registration_date,
    contact_name:member.primary_contact_name,source_email:member.primary_contact_email,
    recipient_name:recipient,invoice_address:email,
    sender:senderFromSettings(settings,campaign.tax_treatment.text),bylaws:annualDuesBylaws,...(input.replaces_id?{replaces_id:accountingId(input.replaces_id)}:{})};
  const invoice={id:accountingId(input.id),year,number:campaign.number_prefix+campaign.next_number,issued_on:issued,due_on:due.toISOString().slice(0,10),amount_ore:Number(campaign.amount_ore),snapshot};
  let document;try{document=await invoicePdf(invoice);}catch(error){if(error.message==='invoiceTextTooLong')throw new AccountingError('documentTooLong');throw error;}
  if(document.recipientNameTruncated)snapshot.recipient_name_truncated=true;
  await sql`SELECT annual_dues_issue(${invoice.id},${year},${input.member_id}::bigint,${issued}::date,${invoice.number},${JSON.stringify(snapshot)}::jsonb,${document.bytes.toString('base64')},${document.sha256},${actor})`;
  const [saved]=await sql`SELECT number FROM annual_dues_invoices WHERE id=${invoice.id}`;
  return {id:invoice.id,number:saved.number};
}
function batchIds(input,key){
  if(!Array.isArray(input[key])||!input[key].length||input[key].length>10||new Set(input[key]).size!==input[key].length)throw new AccountingError('invalidInput');
  return input[key];
}
export async function issueDuesBatch(input){
  await writeActor();const year=accountingYear(input.year),batch=accountingId(input.batch_id),results=[];
  for(const id of batchIds(input,'member_ids')){
    if(!/^\d{1,18}$/.test(String(id)))throw new AccountingError('invalidInput');
    try{
      const invoice=await issueDuesInvoice({id:createHash('sha256').update(`${batch}:${id}`).digest('hex').slice(0,32),year,member_id:String(id),date:input.date,
        replaces_id:input.replacements?.[id]||undefined,invoice_settings_version:input.invoice_settings_version});
      results.push({member_id:id,...invoice,ok:true});
    }catch(error){results.push({member_id:id,ok:false,code:error.code==='P0001'?error.message:error.code||'unavailable'});}
  }
  return {results};
}
export async function queueDuesBatch(input){
  await writeActor();if(annualDuesSendingMode()!=='live')throw new AccountingError('testBulkDisabled',409);const results=[];
  for(const id of batchIds(input,'invoice_ids')){
    try{
      accountingId(id);
      const [i]=await getSql()`SELECT m.primary_contact_email FROM annual_dues_invoices i JOIN members m ON m.id=i.member_id
        WHERE i.id=${id} AND m.deleted_at IS NULL AND m.title_holder IS NOT DISTINCT FROM i.snapshot->>'title_holder'
          AND NOT EXISTS(SELECT 1 FROM email_deliveries d WHERE d.invoice_id=i.id)`;
      if(!i)throw new AccountingError('ownerReviewRequired');
      await queueDuesInvoice({invoice_id:id});results.push({id,ok:true});
    }catch(error){results.push({id,ok:false,code:error.code==='P0001'?error.message:error.code||'unavailable'});}
  }
  return {results};
}
export async function queueDuesInvoice(input){
  const actor=await writeActor();
  if(!invoiceSendingEnabled())throw new AccountingError('sendingDisabled',409);
  const sql=getSql(),id=accountingId(input.invoice_id),mode=annualDuesSendingMode(),testMemberIds=annualDuesTestMemberIds();
  const [invoice]=await sql`SELECT i.member_id::text,m.primary_contact_email FROM annual_dues_invoices i JOIN members m ON m.id=i.member_id WHERE i.id=${id} AND m.deleted_at IS NULL`;
  if(!invoice?.primary_contact_email)throw new AccountingError('memberChanged',409);
  if(mode==='test'&&!testMemberIds.has(invoice.member_id))throw new AccountingError('testRecipientNotAllowed',403);
  const deliveryId=uuid(),test=mode==='test';
  await sql`SELECT annual_dues_queue(${deliveryId},${id},${invoice.primary_contact_email},${actor},FALSE)`;
  if(test)await sql`UPDATE email_deliveries SET subject='TEST — '||subject,delivery_detail=jsonb_build_object('sending_mode','test') WHERE id=${deliveryId}`;
  return {id,queued:true};
}
export async function recordDuesPayment(input){
  const actor=await writeActor(), p=paymentInput(input);
  await getSql()`SELECT annual_dues_pay(${p.id},${p.invoice},${p.year},${p.date}::date,${p.amount},${p.reference},${p.evidence},${p.reverses},${actor})`;
  return {id:p.id};
}
export async function creditDuesInvoice(input){
  const actor=await writeActor(), year=accountingYear(input.year), date=invoiceIssueDate(input.date,year), reason=financeText(input.reason,200), id=accountingId(input.invoice_id), sql=getSql();
  const [invoice]=await sql`SELECT id,year,number,issued_on::text,due_on::text,amount_ore::float8,snapshot FROM annual_dues_invoices WHERE id=${id}`;
  const [campaign]=await sql`SELECT number_prefix,next_number FROM annual_dues_campaigns WHERE year=${year}`;
  if(!invoice||!campaign)throw new AccountingError('missingInvoice',404);
  const credit={number:campaign.number_prefix+campaign.next_number,issued_on:date,reason};
  const document=await invoicePdf(invoice,{credit});
  await sql`SELECT annual_dues_credit(${id},${year},${date}::date,${credit.number},${reason},${document.bytes.toString('base64')},${document.sha256},${actor})`;
  const [saved]=await sql`SELECT number FROM annual_dues_credits WHERE invoice_id=${id}`;
  return {number:saved.number};
}
export async function closeFinanceYear(input){
  const actor=await writeActor(),year=accountingYear(input.year);
  if(input.reviewed!==true)throw new AccountingError('reviewedRequired');
  await getSql()`SELECT finance_close(${year},${actor},${financeText(input.evidence)})`;return {year};
}
export async function getInvoiceFile(value,{credit=false}={}){
  await requirePermission('read');const id=accountingId(value),sql=getSql();
  const [file]=credit?await sql`SELECT number,encode(pdf,'base64') AS content FROM annual_dues_credits WHERE invoice_id=${id}`
    :await sql`SELECT number,encode(pdf,'base64') AS content FROM annual_dues_invoices WHERE id=${id}`;
  if(!file)throw new AccountingError('missingInvoice',404);
  return {number:file.number,bytes:Buffer.from(file.content,'base64')};
}

import { getSql } from './db.js';
import { assertDatabaseEnvironment } from './security-config.js';
import { getMailerSendSuppressions, isMailerSendConfigured, isSuppressedRecipient, sendEmail } from './mailer-service.js';
import { invoiceEmailContent } from './annual-dues-email.js';
import { mailFailureDetails } from './mail-failure-log.js';
import { annualDuesSendingMode, annualDuesTestMemberIds } from './annual-dues-sending.js';

export async function processAnnualDues(options={}){
 const env=options.env||process.env;
 const mode=annualDuesSendingMode(env),testMemberIds=annualDuesTestMemberIds(env);
 if(mode==='off'||!isMailerSendConfigured(env))return {disabled:true};
 const sql=options.sql||getSql();await assertDatabaseEnvironment(sql,env);
 await sql`UPDATE email_deliveries SET status='failed',failure_reason='UNCERTAIN_AFTER_INTERRUPTION',failed_at=NOW()
   WHERE email_type='annual_dues' AND status='processing' AND processing_at<NOW()-INTERVAL '16 minutes'`;
 const suppressions=await (options.getSuppressions||getMailerSendSuppressions)({env,sql}), send=options.sendEmail||sendEmail;
 let sent=0;const deadline=Date.now()+12*60_000;
 for(let n=0;n<(options.batchSize||100)&&Date.now()+35_000<deadline;n++){
  const candidates=mode==='test'
   ?await sql`SELECT d.id,i.year FROM email_deliveries d JOIN annual_dues_invoices i ON i.id=d.invoice_id
      WHERE d.email_type='annual_dues' AND d.status='pending' AND (d.invoice_retry_at IS NULL OR d.invoice_retry_at<=NOW())
       AND d.subject LIKE 'TEST — %' AND i.member_id::text=ANY(${[...testMemberIds]}) ORDER BY d.created_at,d.id LIMIT 1`
   :await sql`SELECT d.id,i.year FROM email_deliveries d JOIN annual_dues_invoices i ON i.id=d.invoice_id
      WHERE d.email_type='annual_dues' AND d.status='pending' AND (d.invoice_retry_at IS NULL OR d.invoice_retry_at<=NOW()) ORDER BY d.created_at,d.id LIMIT 1`;
  const [candidate]=candidates;
  if(!candidate)break;
  const results=await sql.transaction([
   sql`SELECT pg_advisory_xact_lock(62719,${candidate.year})`,
   sql`UPDATE email_deliveries SET status='processing',processing_at=NOW(),invoice_attempt_count=invoice_attempt_count+1
    WHERE id=${candidate.id} AND status='pending' AND EXISTS (SELECT 1 FROM accounting_years WHERE id=${candidate.year} AND closed_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM annual_dues_credits WHERE invoice_id=email_deliveries.invoice_id)
    RETURNING id,invoice_id,recipient_email,invoice_attempt_count,subject`,
  ]);
  const d=results[1][0];if(!d)continue;
  const [i]=await sql`SELECT id,year,number,member_id::text,issued_on::text,due_on::text,amount_ore::float8,snapshot,encode(pdf,'base64') AS content FROM annual_dues_invoices WHERE id=${d.invoice_id}`;
  const [current]=await sql`SELECT id FROM members WHERE id=${i.member_id}::bigint AND deleted_at IS NULL AND membership_status='member'
    AND primary_contact_email=${d.recipient_email} AND title_holder IS NOT DISTINCT FROM ${i.snapshot.title_holder}
    AND registration_date IS NOT DISTINCT FROM ${i.snapshot.registration_date}
    AND annual_dues_eligibility(registration_date,${i.year})='eligible'`;
  if(!current){await sql`UPDATE email_deliveries SET status='failed',failure_reason='MEMBER_CHANGED',failed_at=NOW() WHERE id=${d.id}`;continue;}
  const [blocked]=await sql`SELECT recipient_email FROM email_suppressions WHERE recipient_email=${d.recipient_email}`;
  if(blocked||isSuppressedRecipient(d.recipient_email,suppressions)){
   await sql`UPDATE email_deliveries SET status='suppressed',failure_reason='RECIPIENT_SUPPRESSED',failed_at=NOW() WHERE id=${d.id}`;continue;
  }
  try{
   const content=invoiceEmailContent(i);
   // PostgreSQL encode(bytea, 'base64') inserts line breaks; MailerSend requires a compact string.
   const attachment=Buffer.from(i.content,'base64').toString('base64');
   const {messageId}=await send({to:d.recipient_email,...content,subject:d.subject,attachments:[{content:attachment,filename:`${i.number}.pdf`,disposition:'attachment'}],tags:['annual-dues'],
    context:{emailType:'annual_dues',deliveryId:d.id,memberId:i.member_id,recipient:d.recipient_email}},{env,sql});
   await sql`UPDATE email_deliveries SET status='sent',provider_message_id=${messageId},sent_at=NOW(),failure_reason=NULL WHERE id=${d.id}`;
   // A callback may arrive before the API response. Its details are already archived.
   await sql`UPDATE email_deliveries d SET status=CASE
     WHEN EXISTS(SELECT 1 FROM email_webhook_events WHERE provider_message_id=d.provider_message_id AND event_type IN ('activity.hard_bounced','activity.suppressed','activity.spam_complaint','activity.unsubscribed')) THEN 'bounced'
     WHEN EXISTS(SELECT 1 FROM email_webhook_events WHERE provider_message_id=d.provider_message_id AND event_type='activity.delivered') THEN 'delivered'
     WHEN EXISTS(SELECT 1 FROM email_webhook_events WHERE provider_message_id=d.provider_message_id AND event_type='activity.soft_bounced') THEN 'failed' ELSE status END,
     failure_reason=coalesce((SELECT event_type FROM email_webhook_events WHERE provider_message_id=d.provider_message_id AND event_type IN ('activity.hard_bounced','activity.suppressed','activity.spam_complaint','activity.unsubscribed') ORDER BY created_at DESC LIMIT 1),failure_reason),
     failed_at=coalesce((SELECT min(coalesce(occurred_at,created_at)) FROM email_webhook_events WHERE provider_message_id=d.provider_message_id AND event_type IN ('activity.hard_bounced','activity.suppressed','activity.spam_complaint','activity.unsubscribed')),failed_at),
     delivery_detail=coalesce((SELECT detail FROM email_webhook_events WHERE provider_message_id=d.provider_message_id ORDER BY (event_type IN ('activity.hard_bounced','activity.suppressed','activity.spam_complaint','activity.unsubscribed')) DESC,coalesce(occurred_at,created_at) DESC LIMIT 1),delivery_detail),
     delivered_at=(SELECT min(occurred_at) FROM email_webhook_events WHERE provider_message_id=d.provider_message_id AND event_type='activity.delivered')
     WHERE id=${d.id}`;
   await sql`INSERT INTO email_suppressions(recipient_email,reason) SELECT ${d.recipient_email},'provider-webhook'
    WHERE EXISTS(SELECT 1 FROM email_webhook_events WHERE provider_message_id=${messageId} AND event_type IN ('activity.hard_bounced','activity.suppressed','activity.spam_complaint','activity.unsubscribed'))
    ON CONFLICT(recipient_email) DO NOTHING`;
   await sql`UPDATE member_annual_fees SET invoiced_on=coalesce(invoiced_on,(NOW() AT TIME ZONE 'Europe/Oslo')::date),last_changed_by='system:annual-dues',updated_at=NOW()
     WHERE member_id=${i.member_id}::bigint AND fee_year=${i.year}`;
   sent++;
  }catch(error){
   const retry=error.providerStatus===429&&d.invoice_attempt_count<5,parsed=Date.parse(error.retryAt);
   const next=retry?new Date(Math.max(Date.now()+60_000,Number.isFinite(parsed)?parsed:0)).toISOString():null;
   const detail=mailFailureDetails(error,{emailType:'annual_dues',deliveryId:d.id,memberId:i.member_id,recipient:d.recipient_email},{env,sensitive:[i.content]});
   await sql`UPDATE email_deliveries SET status=${retry?'pending':error.code==='SUPPRESSED'?'suppressed':'failed'},failure_reason=${String(error.code||'SEND_FAILED').slice(0,100)},
     delivery_detail=${JSON.stringify(detail)}::jsonb,invoice_retry_at=${next},failed_at=CASE WHEN ${retry} THEN NULL ELSE NOW() END WHERE id=${d.id}`;
   if(retry)break;
  }
  if(options.delayMs!==0)await new Promise(resolve=>setTimeout(resolve,6100));
 }
 return {sent};
}

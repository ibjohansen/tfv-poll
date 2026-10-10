import 'server-only';
import { getSql } from './db.js';
import { requirePermission } from './admin-access.js';
import { accountingYear } from './accounting-validation.js';
import { isMockMode } from './mock-store.js';
import { getMailerSendSuppressions, getMailerSendSuppressionDetails, getMailerSendRecipientDiagnostics } from './mailer-service.js';
import { mailFailureDetails } from './mail-failure-log.js';

export async function getDuesDeliveryDiagnostics(value,options={}){
 await requirePermission('read');const year=accountingYear(value),checked_at=new Date().toISOString();
 if(isMockMode())return {checked_at,deliveries:{},limitations:[]};
 const sql=options.sql||getSql(),env=options.env||process.env;
 const rows=await sql`SELECT d.id,d.recipient_email,s.reason AS local_reason FROM email_deliveries d
  JOIN annual_dues_invoices i ON i.id=d.invoice_id LEFT JOIN email_suppressions s ON s.recipient_email=d.recipient_email
  WHERE i.year=${year} AND d.status IN ('failed','bounced','suppressed') ORDER BY d.created_at DESC`;
 const deliveries=Object.fromEntries(rows.map(d=>[d.id,{suppression_reasons:[],lookup_complete:false,
  local_suppression_reason:mailFailureDetails({providerMessage:d.local_reason},{recipient:d.recipient_email},{env}).provider_message}]));
 if(!rows.length)return {checked_at,deliveries,limitations:[]};
 const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(25_000)]):AbortSignal.timeout(25_000);
 const providerOptions={env,sql,signal,...(options.fetchImpl?{fetchImpl:options.fetchImpl}:{})},limitations=[];
 let suppressions;
 try{suppressions=await (options.getSuppressions||getMailerSendSuppressions)(providerOptions);}
 catch(error){return {checked_at,deliveries,limitations:[{operation:'suppression_lookup',...mailFailureDetails(error,{operation:'suppression_lookup'},{env})}]};}
 const histories=new Map();
 for(const row of rows){
  const detail=deliveries[row.id];detail.lookup_complete=true;detail.suppression_reasons=getMailerSendSuppressionDetails(row.recipient_email,suppressions);
  const recipientId=detail.suppression_reasons.find(d=>d.recipient_id)?.recipient_id;
  if(!recipientId)continue;
  if(!histories.has(recipientId)){
   // A denied history lookup does not discard the available suppression reasons.
   if(limitations.length)continue;
   try{histories.set(recipientId,await (options.getRecipientDiagnostics||getMailerSendRecipientDiagnostics)(recipientId,providerOptions));}
   catch(error){limitations.push({operation:'recipient_history',...mailFailureDetails(error,{operation:'recipient_history'},{env})});continue;}
  }
  detail.recipient_history=histories.get(recipientId);
 }
 return {checked_at,deliveries,limitations};
}

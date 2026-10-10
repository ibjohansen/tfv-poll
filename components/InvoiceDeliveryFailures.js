'use client';
import { useCallback, useEffect, useState } from 'react';
import { deliveryExplanation, invoiceDeliveryIssues, suppressionExplanation } from '@/lib/annual-dues-delivery';
import { invoicePropertyReference } from '@/lib/annual-dues-email';

const time=value=>{
 if(!value)return 'Ikke registrert';
 const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('nb-NO',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Oslo'}).format(date):String(value);
};
const statuses={pending:'Venter på nytt forsøk',failed:'Feil eller uavklart',bounced:'Permanent leveringsfeil',suppressed:'Sperret mottaker',sent:'Godtatt av mailtjenesten',delivered:'Levert',processing:'Under behandling'};
const labels={http_status:'HTTP-status',provider_code:'MailerSends feilkode',provider_message:'MailerSends opprinnelige melding',request_id:'Forespørsels-ID',network_code:'Nettverkskode',retry_at:'Neste forsøk',reason:'Oppgitt årsak',enhanced_code:'SMTP-underkode',bounce_code:'MailerSends returkode',bounce_type:'Type leveringsfeil',delayed:'Forsinket levering',suppression_source:'Kilde for sperringen',local_suppression_reason:'Lokalt registrert sperregrunn',error_id:'Feil-ID',code:'Feilkode',message:'Feilmelding',validation_errors:'Valideringsfeil',provider:'Mailtjeneste',operation:'Operasjon',type:'Sperreliste',provider_id:'MailerSends sperre-ID',recipient_id:'MailerSends mottaker-ID',created_at:'Registrert hos MailerSend',updated_at:'Sist endret hos MailerSend',matched_domain:'Sperret domene',provider_email_id:'MailerSends e-post-ID',status:'Status',action:'Logghendelse',email_type:'Meldingstype',mail_id:'Sendeforsøk-ID',member_id:'Medlems-ID'};

export function DiagnosticFields({detail}){
 const entries=Object.entries(detail||{}).filter(([,v])=>v!==null&&v!==undefined&&v!==false&&(!Array.isArray(v)||v.length));
 return entries.length?<dl className="finance-details">{entries.map(([key,value])=><div key={key}><dt>{labels[key]||key}</dt><dd>{typeof value==='object'?<pre className="finance-diagnostic-json">{JSON.stringify(value,null,2)}</pre>:key.endsWith('_at')?time(value):String(value)}</dd></div>)}</dl>:null;
}

function SuppressionDetails({details}){
 return details?.map((detail,index)=><div key={index} className="finance-event"><p>{suppressionExplanation(detail)}</p><DiagnosticFields detail={detail}/></div>);
}

export function DeliveryDiagnostic({delivery,live,headingLevel=4}){
 const Heading=`h${headingLevel}`,d=delivery;
 return <section className="finance-delivery">
  <Heading>Forsøk {d.attempt} · {d.detail?.delayed?'Forsinket levering':statuses[d.status]||d.status}</Heading>
  <dl className="finance-details"><dt>Emne</dt><dd>{d.subject||'Ikke registrert'}</dd><dt>Mottakeradresse ved forsøket</dt><dd>{d.recipient}</dd>
   <dt>Lagt i kø</dt><dd>{time(d.queued_at)}</dd><dt>Godtatt av MailerSend</dt><dd>{time(d.sent_at)}</dd><dt>Levert</dt><dd>{time(d.delivered_at)}</dd><dt>Feil registrert</dt><dd>{time(d.failed_at)}</dd>
   <dt>Feilkode</dt><dd>{d.failure_reason||'Ikke oppgitt'}</dd><dt>Mailtjenestens meldings-ID</dt><dd>{d.provider_message_id||'Ikke oppgitt'}</dd>
   <dt>Sendeforsøk-ID</dt><dd>{d.id}</dd>{d.retry_at&&<><dt>Neste forsøk</dt><dd>{time(d.retry_at)}</dd></>}
   {d.attempt_count!==undefined&&<><dt>Antall behandlingsforsøk</dt><dd>{d.attempt_count}</dd></>}
  </dl>
  {(d.failure_reason||d.detail)&&<p>{deliveryExplanation(d.detail||{},d.failure_reason)}</p>}
  <DiagnosticFields detail={Object.fromEntries(Object.entries(d.detail||{}).filter(([key])=>key!=='suppression_reasons'))}/>
  <SuppressionDetails details={d.detail?.suppression_reasons}/>
  {live&&<div className="finance-event"><p><strong>Oppdatert informasjon fra MailerSend</strong></p>
   <SuppressionDetails details={live.suppression_reasons}/>
   {live.local_suppression_reason&&<p>Lokalt registrert sperregrunn: {live.local_suppression_reason}</p>}
   {live.lookup_complete&&!live.suppression_reasons?.length&&<p>Ingen nåværende oppføring i MailerSends sperrelister. Tidligere registrerte feil beholdes.</p>}
   {live.lookup_complete===false&&<p>Nåværende sperregrunn kunne ikke hentes fra MailerSend.</p>}
   {live.recipient_history&&<><p><strong>Mottakerhistorikk fra MailerSend</strong></p><DiagnosticFields detail={{created_at:live.recipient_history.created_at,updated_at:live.recipient_history.updated_at}}/>
    {live.recipient_history.emails.map((email,index)=><DiagnosticFields key={index} detail={email}/>)}</>}
  </div>}
  {(d.events||[]).map((event,index)=><div key={index} className="finance-event"><p><strong>{event.type}</strong> · {time(event.occurred_at||event.received_at)}</p><DiagnosticFields detail={event.detail}/>
   {(event.detail?.enhanced_code||event.detail?.bounce_code)&&<p>{deliveryExplanation(event.detail)}</p>}</div>)}
 </section>;
}

export default function InvoiceDeliveryFailures({invoices,year,apiFetch}){
 const [includeHistory,setIncludeHistory]=useState(false),[search,setSearch]=useState(''),[diagnostics,setDiagnostics]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(null);
 const activeKey=invoiceDeliveryIssues(invoices).map(({invoice})=>invoice.deliveries.at(-1).id).join(',');
 const requestKey=`${year}:${activeKey}`;
 const load=useCallback(async(signal)=>{
  const response=await apiFetch(`/api/admin/accounting/dues?year=${year}&diagnostics=delivery`,{cache:'no-store',signal});
  const result=await response.json();if(!response.ok)throw new Error('unavailable');
  return result.data;
 },[apiFetch,year]);
 useEffect(()=>{
  const controller=new AbortController();
  if(activeKey)load(controller.signal).then(data=>{if(!controller.signal.aborted){setDiagnostics({...data,year,requestKey});setError(null);}})
   .catch(()=>{if(!controller.signal.aborted)setError({requestKey,message:'Kunne ikke hente oppdatert feilinformasjon fra MailerSend. Registrerte feil vises fortsatt.'});});
  return()=>controller.abort();
 },[activeKey,load,year,requestKey]);
 async function refresh(){
  setLoading(true);setError(null);
  try{setDiagnostics({...await load(),year,requestKey});}
  catch{setError({requestKey,message:'Kunne ikke hente oppdatert feilinformasjon fra MailerSend. Registrerte feil vises fortsatt.'});}
  finally{setLoading(false);}
 }
 const current=diagnostics?.requestKey===requestKey?diagnostics:null;
 const pending=loading||Boolean(activeKey&&!current&&error?.requestKey!==requestKey);
 const issues=invoiceDeliveryIssues(invoices,{includeHistory}).filter(issue=>JSON.stringify([issue.invoice.snapshot,issue.invoice.number,issue.deliveries,issue.deliveries.map(d=>current?.deliveries?.[d.id])]).toLocaleLowerCase('nb-NO').includes(search.toLocaleLowerCase('nb-NO')));
 return <div className="finance-failures">
  <p>Mislykkede, sperrede og forsinkede utsendelser, samt utsendelser som venter på nytt forsøk. Oversikten gjelder siste forsøk på gjeldende fakturaer.</p>
  <div className="accounting-toolbar"><label>Søk i utsendelsesfeil<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tomt, adresse, mottaker eller feilkode"/></label>
   <button className="admin-button" type="button" disabled={pending||!invoiceDeliveryIssues(invoices,{includeHistory:true}).length} onClick={refresh}>Oppdater feilinformasjon fra MailerSend</button>
  </div>
  <label className="admin-checkbox"><input type="checkbox" checked={includeHistory} onChange={e=>setIncludeHistory(e.target.checked)}/>Vis også tidligere feil og krediterte fakturaer</label>
  {pending&&<p role="status">Henter sperregrunner og tilgjengelig mottakerhistorikk fra MailerSend …</p>}
  {error?.requestKey===requestKey&&<p className="form-error" role="alert">{error.message}</p>}
  {current?.checked_at&&<p>MailerSend kontrollert {time(current.checked_at)}. Dette er nåværende opplysninger; lagret utsendelseshistorikk beholdes.</p>}
  {current?.limitations?.map((limit,index)=><div className="accounting-notice" key={index}>
   <p>{limit.operation==='recipient_history'&&limit.http_status===403?'MailerSend gir ikke tilgang til utvidet mottakerhistorikk med dagens API-tilgang (HTTP 403). Tilgjengelige sperregrunner vises nedenfor.':'MailerSend kunne ikke gi alle opplysningene. Registrerte feil og tilgjengelige detaljer vises fortsatt.'}</p>
   <details><summary>Detaljer om begrensningen</summary><DiagnosticFields detail={limit}/></details>
  </div>)}
  {!issues.length?<p>Ingen utsendelsesfeil i dette utvalget.</p>:<p>{issues.length} fakturaer i utvalget.</p>}
  {issues.map(({invoice,deliveries,resolved})=><article className="finance-failure-card" key={invoice.id}>
   <h4>{invoicePropertyReference(invoice.snapshot.h_number)} · {invoice.snapshot.street_address||'Adresse ikke registrert'}</h4>
   <p>{invoice.number} · {invoice.snapshot.recipient_name}</p><p>Nåværende hoved-e-post: {invoice.current_email||'Ikke registrert'}</p>
   {resolved&&<p className="accounting-notice">Historisk feil · {invoice.credit_number?'fakturaen er kreditert':`siste forsøk: ${statuses[invoice.deliveries.at(-1)?.status]||'Ingen utsendelse'}`}</p>}
   {deliveries.map(d=>{
    const reasons=current?.deliveries?.[d.id]?.suppression_reasons?.length?current.deliveries[d.id].suppression_reasons:d.detail?.suppression_reasons;
    return <div key={d.id}><p><strong>{d.detail?.delayed?'Forsinket levering':statuses[d.status]||d.status}</strong> · {time(d.failed_at||d.queued_at)}</p>
     {reasons?.length?reasons.map((reason,index)=><div key={index}><p>{suppressionExplanation(reason)}</p>{reason.reason&&<p>MailerSend: {reason.reason}</p>}{reason.created_at&&<p>Sperringen ble registrert {time(reason.created_at)}.</p>}</div>):<p>{deliveryExplanation(d.detail||{},d.failure_reason)}</p>}
    </div>;
   })}
   <details className="finance-failure-details"><summary>Vis alle feildetaljer · {invoice.number}</summary>
    <p><a href={`/api/admin/accounting/dues/${invoice.id}`} target="_blank" rel="noopener">Åpne lagret faktura PDF</a></p>
    {deliveries.map(d=><DeliveryDiagnostic key={d.id} delivery={d} live={current?.deliveries?.[d.id]} headingLevel={5}/>)}
   </details>
  </article>)}
 </div>;
}

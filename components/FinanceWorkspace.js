'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApiClient } from '@/components/useApiClient';
import { financeMessages } from '@/lib/annual-dues-validation';
import { deliveryExplanation } from '@/lib/annual-dues-delivery';

const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo'}).format(new Date());
const uuid=()=>crypto.randomUUID().replaceAll('-','');
const money=n=>new Intl.NumberFormat('nb-NO',{style:'currency',currency:'NOK'}).format(n/100);
const time=value=>value?new Intl.DateTimeFormat('nb-NO',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Oslo'}).format(new Date(value)):'Ikke registrert';
const statuses={pending:'I kø',processing:'Under behandling',sent:'Godtatt av mailtjenesten',delivered:'Levert til mottakerens server',failed:'Feil eller uavklart',bounced:'Permanent leveringsfeil',suppressed:'Sperret mottaker'};

export function InvoiceHistory({invoice}){
 return <details className="finance-history"><summary>Utsendelser og betalinger · {invoice.number}</summary>
  <p><a href={`/api/admin/accounting/dues/${invoice.id}`} target="_blank" rel="noopener">Åpne lagret faktura PDF</a>{invoice.credit_number&&<> · <a href={`/api/admin/accounting/dues/${invoice.id}?credit=true`} target="_blank" rel="noopener">Kreditnota {invoice.credit_number}</a></>}</p>
  <p>Fakturert {invoice.issued_on} · Forfall {invoice.due_on} · {money(invoice.amount_ore)} · {invoice.snapshot.recipient_name} · {invoice.snapshot.invoice_address}</p>
  {invoice.deliveries.length===0?<p>Ingen utsendelse er registrert.</p>:invoice.deliveries.map(d=><section key={d.id} className="finance-delivery">
   <h4>Forsøk {d.attempt} · {d.detail?.delayed?'Forsinket levering':statuses[d.status]||d.status}</h4>
   <dl className="finance-details"><dt>Mottakeradresse</dt><dd>{d.recipient}</dd><dt>Lagt i kø</dt><dd>{time(d.queued_at)}</dd><dt>Sendt</dt><dd>{time(d.sent_at)}</dd><dt>Levert</dt><dd>{time(d.delivered_at)}</dd><dt>Feil registrert</dt><dd>{time(d.failed_at)}</dd><dt>Mailtjenestens meldings-ID</dt><dd>{d.provider_message_id||'Ikke oppgitt'}</dd></dl>
   {(d.failure_reason||d.detail)&&<><p>{deliveryExplanation(d.detail||{},d.failure_reason)}</p><dl className="finance-details">{Object.entries(d.detail||{}).filter(([,v])=>v!==null&&v!==false).map(([k,v])=><div key={k}><dt>{({http_status:'HTTP-status',provider_code:'Tilbyders kode',provider_message:'Tilbyders melding',request_id:'Forespørsels-ID',network_code:'Nettverkskode',retry_at:'Neste forsøk',reason:'Oppgitt årsak',enhanced_code:'SMTP-underkode',bounce_code:'Tilbyders feilkode'})[k]||k}</dt><dd>{typeof v==='object'?JSON.stringify(v):String(v)}</dd></div>)}</dl></>}
   {d.events.map((e,index)=><div key={index} className="finance-event"><p><strong>{e.type}</strong> · {time(e.occurred_at||e.received_at)}</p>{e.detail?.reason&&<p>{e.detail.reason}</p>}{(e.detail?.enhanced_code||e.detail?.bounce_code)&&<p>{e.detail.enhanced_code||e.detail.bounce_code}: {deliveryExplanation(e.detail)}</p>}</div>)}
  </section>)}
  <p>Levert betyr at mottakerens server har tatt imot meldingen. Det dokumenterer ikke at fakturaen er lest eller betalt.</p>
  {invoice.payments.length>0&&<><h4>Dokumenterte betalinger og korreksjoner</h4><ul>{invoice.payments.map(p=><li key={p.id}>{p.date} · {p.reverses_id?'Korreksjon −':''}{money(p.amount_ore)} · {p.reference} · {p.evidence}</li>)}</ul></>}
 </details>;
}

export default function FinanceWorkspace({year,canWrite=false,memberId=null,onMutation,onCampaignState,onOpenSettings}){
 const apiFetch=useApiClient(),[data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [filter,setFilter]=useState('all'),[search,setSearch]=useState('');
 const [campaign,setCampaign]=useState({amount:'250',prefix:`AK-${year}-`,first_number:1,vat_exempt:false,reviewed:false});
 const [payment,setPayment]=useState(null),[close,setClose]=useState({evidence:'',reviewed:false});
 const [resend,setResend]=useState(null),[credit,setCredit]=useState(null);
 const [sendReviewed,setSendReviewed]=useState(false),[batchId,setBatchId]=useState(uuid);
 const [historyYear,setHistoryYear]=useState(year);
 const viewYear=memberId?historyYear:year;
 const load=useCallback(async(signal)=>{
  const response=await apiFetch(`/api/admin/accounting/dues?year=${viewYear}${memberId?`&member_id=${encodeURIComponent(memberId)}`:''}`,{cache:'no-store',signal});
  const body=await response.json();if(!response.ok)throw new Error(body.code||'unavailable');
  return body;
 },[apiFetch,viewYear,memberId]);
 const applyOverview=useCallback(body=>{setData(body.data);setCampaign(c=>({...c,reviewed:false}));},[]);
 async function refresh(){applyOverview(await load());}
 useEffect(()=>{const controller=new AbortController();load(controller.signal).then(body=>{if(!controller.signal.aborted)applyOverview(body);}).catch(e=>{if(!controller.signal.aborted)setError(financeMessages[e.message]||financeMessages.unavailable);});return()=>controller.abort();},[load,applyOverview]);
 useEffect(()=>{if(data&&memberId)onCampaignState?.(String(memberId),viewYear,Boolean(data.campaign));},[data,memberId,viewYear,onCampaignState]);
 async function save(operation,input){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   const response=await apiFetch('/api/admin/accounting/dues',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year,operation,...input})});
   const body=await response.json();if(!response.ok)throw new Error(body.code||'unavailable');
   await refresh();await onMutation?.();setNotice('Lagret.');setPayment(null);setResend(null);setCredit(null);
  }catch(e){setError(financeMessages[e.message]||`Kunne ikke lagre (${e.message}). Kontroller opplysningene og last inn på nytt ved behov.`);}
  finally{setBusy(false);}
 }
 async function runBatch(operation,entries){
  if(busy||(operation==='queue_batch'&&!sendReviewed)||!entries.length)return;
  setBusy(true);setError('');let saved=0;const failures=[];
  try{
   for(let offset=0;offset<entries.length;offset+=10){
    setNotice(`Behandler ${offset+1}–${Math.min(offset+10,entries.length)} av ${entries.length} …`);
    const slice=entries.slice(offset,offset+10),body={year,operation,reviewed:operation==='queue_batch',batch_id:batchId,date:today(),invoice_settings_version:data.invoiceSettings?.version,
     ...(operation==='issue_batch'?{member_ids:slice.map(m=>m.id),replacements:Object.fromEntries(slice.filter(m=>m.replaces_id).map(m=>[m.id,m.replaces_id]))}:{invoice_ids:slice.map(i=>i.id)})};
    const response=await apiFetch('/api/admin/accounting/dues',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw new Error(result.code||'unavailable');
    for(const r of result.result.results){if(r.ok)saved++;else failures.push(`${r.member_id||r.id}: ${financeMessages[r.code]||r.code}`);}
   }
   setBatchId(uuid());setNotice(`${saved} ${operation==='issue_batch'?'fakturaer lagret':'fakturaer lagt i kø'}. ${failures.length} trenger oppfølging.`);
   if(failures.length)setError(failures.join(' · '));
  }catch(e){setError(financeMessages[e.message]||financeMessages.unavailable);setNotice(`${saved} bekreftet behandlet. Oppdater listen før et nytt forsøk.`);}
  finally{await refresh().catch(()=>{});await Promise.resolve(onMutation?.()).catch(()=>{});setSendReviewed(false);setBusy(false);}
 }
 if(!data)return <section className="accounting-panel"><p role={error?'alert':'status'}>{error||'Henter fakturering …'}</p></section>;
 if(!data.installed)return <section className="accounting-panel"><h2>Fakturering</h2><p>Datagrunnlaget for denne funksjonen er ikke installert i dette miljøet ennå.</p></section>;
 if(memberId)return <section className="admin-detail-section"><h3>Fakturaer og utsendelser</h3><label>Fakturaår<input type="number" min="2000" max="2099" value={historyYear} onChange={e=>{const next=Number(e.target.value);if(next>=2000&&next<=2099)setHistoryYear(next);}}/></label>{data.invoices.length?data.invoices.map(i=><InvoiceHistory key={i.id} invoice={i}/>):<p>Ingen faktura registrert for dette året.</p>}<Link href={`/admin/regnskap?year=${historyYear}`}>Åpne Økonomi</Link></section>;
 const open=canWrite&&!data.yearClosed;
 const invoiceSettings=data.invoiceSettings||{version:0,sender_address:'',bank_account:''};
 const settingsReady=invoiceSettings.version>0&&Boolean(invoiceSettings.bank_account);
 const invoices=data.invoices.filter(i=>(filter==='all'||filter==='paid'&&!i.credit_number&&i.paid_ore===i.amount_ore||filter==='unpaid'&&!i.credit_number&&i.paid_ore<i.amount_ore||filter==='errors'&&(i.eligibility!=='eligible'||i.current_title_holder!==i.snapshot.title_holder||i.deliveries.some(d=>['failed','bounced','suppressed'].includes(d.status)||d.detail?.delayed||d.status==='pending'&&d.failure_reason)))&&`${i.number} ${i.snapshot.h_number} ${i.snapshot.street_address} ${i.snapshot.recipient_name}`.toLocaleLowerCase('nb-NO').includes(search.toLocaleLowerCase('nb-NO')));
 const outstanding=data.invoices.reduce((n,i)=>n+(i.credit_number?0:i.amount_ore-i.paid_ore),0),paid=data.invoices.reduce((n,i)=>n+i.paid_ore,0);
 return <div className="finance-workspace" aria-busy={busy}>
  <div className="accounting-toolbar"><button className="admin-button" type="button" disabled={busy} onClick={()=>refresh().catch(()=>setError(financeMessages.unavailable))}>Oppdater fakturalisten</button></div>
  <div role="status">{notice}</div>{error&&<p className="form-error" role="alert">{error}</p>}
  {data.yearClosed&&<p className="accounting-notice">Regnskapsåret og kampanjen er avsluttet. Nye fakturaer og utsendelser er sperret. Ubetalte krav beholdes.</p>}
   <section className="accounting-panel"><h2>Årskontingent {year}</h2><div className="accounting-stats">{[['Fakturaer',data.invoices.length],['Innbetalt',money(paid)],['Utestående',money(outstanding)],['Nye eller krediterte tomter',data.candidates.length]].map(([label,value])=><div className="accounting-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <p>{data.campaign?`${data.campaign.closed_at?'Avsluttet':'Åpen'} kampanje · ${money(data.campaign.amount_ore)} per tomt · neste nummer ${data.campaign.number_prefix}${data.campaign.next_number}`:'Ingen kampanje er åpnet for året.'}</p>
    {!data.sendingEnabled&&<p className="accounting-notice">E-postsending er avskrudd i dette miljøet. Fakturaer og betalingsregistrering kan kontrolleres uten ekte utsendelser.</p>}
   </section>
   <section className="accounting-panel"><h3>Fakturaavsender fra Innstillinger</h3><p>{invoiceSettings.name||'Turufjell Vel'}</p><p style={{whiteSpace:'pre-line'}}>{invoiceSettings.sender_address}</p>{settingsReady?<p>Bankkonto: {invoiceSettings.bank_account} · {invoiceSettings.reply_to}</p>:<p className="accounting-notice">Lagre foreningens bankkonto under Innstillinger før fakturering.</p>}{onOpenSettings&&<button className="admin-button" type="button" onClick={onOpenSettings}>Åpne fakturainnstillinger</button>}</section>
   {data.campaign&&<p className="accounting-notice">Avgiftsbehandling for kampanjen: {data.campaign.tax_treatment?.text||data.campaign.sender.vat}</p>}
   {!data.campaign&&open&&<form className="accounting-panel" onSubmit={e=>{e.preventDefault();save('campaign',{...campaign,first_number:Number(campaign.first_number)});}}><fieldset disabled={busy||!settingsReady}><legend>Start årets kampanje</legend><p>Det kan åpnes én kampanje per år. Beløp, avgiftsbehandling og nummerserie lagres på kampanjen. Avsender hentes fra Innstillinger.</p>
    <div className="accounting-fields">{[['amount','Årskontingent i NOK'],['prefix','Prefiks i fakturanummer'],['first_number','Første ledige nummer']].map(([key,label])=><label key={key}>{label}<input required maxLength={320} value={campaign[key]} onChange={e=>setCampaign({...campaign,[key]:e.target.value,reviewed:false})}/></label>)}</div>
    <label className="admin-checkbox"><input type="checkbox" required checked={campaign.vat_exempt} onChange={e=>setCampaign({...campaign,vat_exempt:e.target.checked,reviewed:false})}/>Avgiftsunntak for kampanjen: Årskontingent er unntatt merverdiavgift</label>
    <label className="admin-checkbox"><input type="checkbox" required checked={campaign.reviewed} onChange={e=>setCampaign({...campaign,reviewed:e.target.checked,invoice_settings_version:invoiceSettings.version})}/>Avsender, bankkonto, tidligere fakturering og ledig nummerserie er kontrollert</label><button type="submit" className="primary-button">Start kampanjen</button></fieldset></form>}
   {data.campaign&&open&&<section className="accounting-panel"><h3>Suppler kampanjen</h3><p>Aktive ordinære medlemmer med hjemmelsdato senest 1. februar og uten et gjeldende krav. Fakturaen bruker hjemmelshaver som mottaker og hoved-e-post som fakturaadresse.</p><div className="finance-table-wrap" role="region" tabIndex={0} aria-label="Tomter som kan faktureres"><table><caption>Tomter som kan faktureres</caption><thead><tr><th>Tomt</th><th>Mottaker og fakturaadresse</th><th>Handling</th></tr></thead><tbody>{data.candidates.map(m=><tr key={m.id}><th scope="row">{m.h_number}<br/>{m.street_address}</th><td>{m.title_holder||m.primary_contact_name||'Mangler mottaker'}<br/>{m.primary_contact_email||'Mangler hoved-e-post'}</td><td><button className="admin-button" type="button" disabled={busy||!m.primary_contact_email} onClick={()=>save('issue',{id:uuid(),member_id:m.id,date:today(),replaces_id:m.replaces_id||undefined,invoice_settings_version:invoiceSettings.version})}>{m.replaces_id?'Utsted erstatningsfaktura':'Utsted faktura'}</button></td></tr>)}</tbody></table></div>
    <button className="primary-button" type="button" disabled={busy||!settingsReady||!data.candidates.some(m=>m.primary_contact_email&&!m.replaces_id)} onClick={()=>runBatch('issue_batch',data.candidates.filter(m=>m.primary_contact_email&&!m.replaces_id))}>Fakturer alle ({data.candidates.filter(m=>m.primary_contact_email&&!m.replaces_id).length})</button>
    <p>Erstatningsfakturaer utstedes enkeltvis. Tomter uten hoved-e-post kan ikke faktureres før adressen er registrert.</p>
   </section>}
   <section className="accounting-panel"><h3>Tomter holdt utenfor fakturering ({data.excluded.length})</h3><p>Hjemmelshavere etter 1. februar {year} skal først ha årskontingent neste år. Manglende eller ulike hjemmelsdatoer må avklares. Disse tomtene tas ikke med i enkeltvis eller samlet fakturering.</p><div className="finance-table-wrap" role="region" tabIndex={0} aria-label="Tomter holdt utenfor fakturering"><table><caption>Unntak fra årets fakturautvalg</caption><thead><tr><th>Tomt</th><th>Hjemmelsdato</th><th>Årsak</th></tr></thead><tbody>{data.excluded.map(m=><tr key={m.id}><th scope="row">{m.h_number}<br/>{m.street_address}</th><td>{m.registration_date||'Mangler'}</td><td>{m.eligibility==='after_cutoff'?`Hjemmel etter 1. februar · først aktuelt ${year+1}`:'Må avklares før fakturering'}</td></tr>)}</tbody></table></div></section>
   <section className="accounting-panel"><h3>Fakturaer, betalinger og leveringsfeil</h3><div className="accounting-toolbar"><label>Vis<select aria-label="Vis fakturaer" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Alle fakturaer</option><option value="paid">Betalte</option><option value="unpaid">Ubetalte og delbetalte</option><option value="errors">Leveringsfeil og uavklarte</option></select></label><label>Søk<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tomt, fakturanummer eller navn"/></label></div>
    {open&&data.sendingEnabled&&<><label className="admin-checkbox"><input type="checkbox" checked={sendReviewed} onChange={e=>setSendReviewed(e.target.checked)}/>Jeg har kontrollert hoved-e-postadressene for første utsendelse</label><button className="primary-button" type="button" disabled={busy||!sendReviewed||!data.invoices.some(i=>!i.deliveries.length&&!i.credit_number&&i.paid_ore<i.amount_ore)} onClick={()=>runBatch('queue_batch',data.invoices.filter(i=>!i.deliveries.length&&!i.credit_number&&i.paid_ore<i.amount_ore))}>Legg alle usendte fakturaer i sendekø</button></>}
    <div className="finance-table-wrap" role="region" tabIndex={0} aria-label="Fakturaoversikt"><table><caption>Fakturaer for årskontingent {year}</caption><thead><tr><th>Tomt og faktura</th><th>Utsendelse</th><th>Betaling</th><th>Handling</th></tr></thead><tbody>{invoices.map(i=>{
     const last=i.deliveries.at(-1),settled=i.credit_number||i.paid_ore===i.amount_ore;
     return <tr key={i.id}><th scope="row">{i.snapshot.h_number} · {i.number}{i.eligibility!=='eligible'&&<p className="accounting-notice">Nåværende hjemmelsdato gir ikke grunnlag for utsendelse av årets faktura. Se unntakslisten.</p>}{i.current_title_holder!==i.snapshot.title_holder&&<p className="accounting-notice">Hjemmelshaver er endret. Den gamle fakturaen beholdes, og utsendelse er sperret.</p>}<InvoiceHistory invoice={i}/></th><td>{last?statuses[last.status]:'Ikke sendt'}</td><td>{i.credit_number?'Kreditert':i.paid_ore===i.amount_ore?'Betalt':i.paid_ore?'Delbetalt':'Ubetalt'}<br/>{money(i.credit_number?0:i.amount_ore-i.paid_ore)} gjenstår</td><td><div className="finance-actions">
      {!settled&&canWrite&&<button type="button" className="admin-button" onClick={()=>setPayment({id:uuid(),invoice_id:i.id,payment_year:Number(today().slice(0,4)),date:today(),amount:String((i.amount_ore-i.paid_ore)/100),reference:'',evidence:''})}>Registrer betaling</button>}
      {!settled&&open&&<><button type="button" className="admin-button" disabled={!data.sendingEnabled||i.eligibility!=='eligible'||i.current_title_holder!==i.snapshot.title_holder||i.current_registration_date!==i.snapshot.registration_date||['pending','processing'].includes(last?.status)} onClick={()=>setResend({invoice_id:i.id,email:i.current_email||'',reviewed:false})}>{last?'Send kopi':'Send faktura'}</button><button type="button" className="admin-button" onClick={()=>setCredit({invoice_id:i.id,date:today(),reason:''})}>Krediter</button></>}
      {canWrite&&i.payments.filter(p=>!p.reverses_id&&!i.payments.some(r=>r.reverses_id===p.id)).map(p=><button key={p.id} className="admin-button" type="button" onClick={()=>setPayment({id:uuid(),invoice_id:i.id,reverses_id:p.id,payment_year:Number(today().slice(0,4)),date:today(),amount:String(p.amount_ore/100),reference:'',evidence:''})}>Korriger betaling {p.reference}</button>)}
     </div></td></tr>;
    })}</tbody></table></div>
   </section>
   {resend&&<form className="accounting-panel" onSubmit={e=>{e.preventDefault();save('queue',resend);}}><fieldset disabled={busy}><legend>Kontroller utsendelse</legend><p>Samme lagrede faktura sendes til nåværende hoved-e-post. Tidligere forsøk beholdes.</p><label>Hoved-e-post<input value={resend.email} readOnly/></label>
    <label className="admin-checkbox"><input type="checkbox" required checked={resend.reviewed} onChange={e=>setResend({...resend,reviewed:e.target.checked})}/>Adressen er bekreftet, og eventuell tidligere utsendelse er avklart</label>
    <button className="primary-button" type="submit">Legg faktura i sendekø</button> <button className="admin-button" type="button" onClick={()=>setResend(null)}>Avbryt</button></fieldset></form>}
   {payment&&<form className="accounting-panel" onSubmit={e=>{e.preventDefault();save('payment',{...payment,payment_year:Number(payment.payment_year)});}}><fieldset disabled={busy}><legend>{payment.reverses_id?'Korriger dokumentert betaling':'Registrer dokumentert betaling'}</legend><p>Bruk bankens betalingsdato, beløp og unik transaksjonsreferanse. En korreksjon beholder den opprinnelige registreringen.</p><div className="accounting-fields">{[['payment_year','Betalingsår'],['date','Betalingsdato'],['amount','Beløp i NOK'],['reference','Unik bankreferanse']].map(([key,label])=><label key={key}>{label}<input required type={key==='date'?'date':'text'} readOnly={key==='amount'&&Boolean(payment.reverses_id)} value={payment[key]} onChange={e=>setPayment({...payment,[key]:e.target.value})}/></label>)}</div><label>Dokumentasjon og begrunnelse<textarea required maxLength={2000} value={payment.evidence} onChange={e=>setPayment({...payment,evidence:e.target.value})}/></label><button className="primary-button" type="submit">Registrer betaling</button> <button className="admin-button" type="button" onClick={()=>setPayment(null)}>Avbryt</button></fieldset></form>}
   {credit&&<form className="accounting-panel" onSubmit={e=>{e.preventDefault();save('credit',credit);}}><fieldset disabled={busy}><legend>Kreditnota</legend><label>Dato<input type="date" required value={credit.date} onChange={e=>setCredit({...credit,date:e.target.value})}/></label><label>Begrunnelse<textarea required maxLength={200} value={credit.reason} onChange={e=>setCredit({...credit,reason:e.target.value})}/></label><p>Fakturaen beholdes. Kreditnotaen opphever kravet.</p><button className="primary-button" type="submit">Utsted kreditnota</button> <button className="admin-button" type="button" onClick={()=>setCredit(null)}>Avbryt</button></fieldset></form>}
  {data.campaign&&open&&<form className="accounting-panel" onSubmit={e=>{e.preventDefault();save('close',close);}}><fieldset disabled={busy}><legend>Avslutt regnskapsåret og kampanjen</legend><p>Brukes når regnskapet er formelt avsluttet. Kampanjen stenges for nye fakturaer og utsendelser. Ubetalte krav og historikk beholdes.</p><label>Dokumentasjon av avslutningen<textarea required value={close.evidence} onChange={e=>setClose({...close,evidence:e.target.value})}/></label><label className="admin-checkbox"><input required type="checkbox" checked={close.reviewed} onChange={e=>setClose({...close,reviewed:e.target.checked})}/>Regnskapet er avsluttet</label><button className="primary-button" type="submit">Avslutt regnskapsåret og kampanjen</button></fieldset></form>}
 </div>;
}

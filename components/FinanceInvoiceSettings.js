'use client';
import {useEffect,useState} from 'react';
import {useApiClient} from '@/components/useApiClient';
import {financeMessages} from '@/lib/annual-dues-validation';

export default function FinanceInvoiceSettings({canWrite=false}){
 const apiFetch=useApiClient(),[settings,setSettings]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  apiFetch('/api/admin/accounting/dues?settings=invoice',{cache:'no-store',signal:controller.signal}).then(async response=>{
   const body=await response.json();if(!response.ok)throw new Error(body.code||'unavailable');
   if(!controller.signal.aborted)setSettings(body.data);
  }).catch(e=>{if(!controller.signal.aborted)setError(financeMessages[e.message]||financeMessages.unavailable);});
  return()=>controller.abort();
 },[apiFetch]);
 async function save(event){
  event.preventDefault();if(busy||!canWrite)return;setBusy(true);setError('');setNotice('');
  try{
   const response=await apiFetch('/api/admin/accounting/dues',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'invoice_settings',...settings})});
   const body=await response.json();if(!response.ok)throw new Error(body.code||'unavailable');
   setSettings(body.result);setNotice('Fakturainnstillingene er lagret.');
  }catch(e){setError(financeMessages[e.message]||financeMessages.unavailable);}finally{setBusy(false);}
 }
 return <section className="accounting-panel" aria-busy={busy}>
  <h2>Innstillinger for faktura</h2>
  <p>Foreningens adresse, bankkonto og kontaktopplysninger gjelder på tvers av regnskapsår. Nye fakturaer henter opplysningene herfra. Lagrede fakturaer og kopier beholder de opprinnelige opplysningene.</p>
  <div role="status">{notice}</div>{error&&<p className="form-error" role="alert">{error}</p>}
  {settings?<form onSubmit={save}><fieldset disabled={!canWrite||busy}><legend>Foreningens fakturaopplysninger</legend>
   <div className="accounting-fields">{[['name','Foreningens navn'],['bank_account','Bankkontonummer'],['organization_number','Organisasjonsnummer'],['phone','Telefon'],['reply_to','E-post'],['website','Nettside']].map(([key,label])=><label key={key}>{label}<input required maxLength={key==='bank_account'?20:160} type={key==='reply_to'?'email':'text'} inputMode={['bank_account','organization_number'].includes(key)?'numeric':key==='phone'?'tel':undefined} aria-describedby={key==='bank_account'?'invoice-bank-help':undefined} value={settings[key]} onChange={e=>{setSettings({...settings,[key]:e.target.value});setNotice('');}}/></label>)}</div>
   <label>Foreningens adresse<textarea required maxLength={320} rows={4} value={settings.sender_address} onChange={e=>{setSettings({...settings,sender_address:e.target.value});setNotice('');}}/></label>
   <p id="invoice-bank-help">Norsk kontonummer med 11 sifre. Mellomrom og punktum fjernes ved lagring.</p>
   <button type="submit" className="primary-button">Lagre fakturainnstillinger</button>
  </fieldset></form>:!error&&<p role="status">Henter fakturainnstillinger …</p>}
 </section>;
}

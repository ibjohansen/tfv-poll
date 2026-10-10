const codes={
 'MS42215':'PDF-vedlegget har et ugyldig Base64-format. E-posten ble avvist og er ikke sendt. Dette er en teknisk feil som må rettes før et nytt sendeforsøk.',
 '5.1.1':'Mottakerens postkasse finnes ikke. Kontroller hoved-e-post med medlemmet.',
 '4.2.2':'Mottakerens postkasse er full. Mailtjenesten kan forsøke igjen.',
 '5.7.1':'Mottakerens server avviser meldingen av policy- eller sikkerhetsgrunner. Kontroller råmeldingen og avsenderoppsettet.',
 'MAILERSEND_DAILY_QUOTA':'Døgnkvoten er brukt opp. Vent til oppgitt tidspunkt for neste forsøk.',
 'MAILERSEND_RATE_LIMIT':'For mange API-kall. Neste forsøk utsettes til oppgitt tidspunkt.',
 'RECIPIENT_SUPPRESSED':'Adressen er sperret. Avklar årsaken før en ny adresse eller utsendelse brukes.',
 'SUPPRESSED':'MailerSend har sperret mottakeren og har ikke sendt meldingen.',
 'ALL_SUPPRESSED':'MailerSend har sperret alle mottakerne av denne meldingen. E-posten er ikke sendt.',
 'activity.hard_bounced':'Mottakerens server har avvist meldingen permanent. Kontroller e-postadressen og MailerSends årsak.',
 'activity.soft_bounced':'Mottakerens server har meldt en midlertidig leveringsfeil. Se MailerSends årsak.',
 'activity.suppressed':'MailerSend har sperret mottakeren. Se oppgitt sperregrunn.',
 'activity.spam_complaint':'Mottakeren har rapportert en tidligere melding som søppelpost.',
 'activity.unsubscribed':'Mottakeren er registrert som avmeldt hos mailtjenesten.',
 'UNCERTAIN_AFTER_INTERRUPTION':'Jobben ble avbrutt. Mailtjenesten kan ha mottatt meldingen. Kontroller meldingsloggen før du sender på nytt.',
 'MEMBER_CHANGED':'Medlemskap, hjemmelshaver, hjemmelsdato eller hoved-e-post er endret. Kontroller tomten før nytt sendeforsøk.',
 'INVOICE_CREDITED':'Fakturaen er kreditert og sendes ikke.',
 'UPSTREAM':'Mailtjenesten avviste forespørselen eller svarte ikke. Kontroller detaljene før et nytt forsøk.',
 '429':'Mailtjenestens kvote eller API-grense er nådd.',
 '401':'Mailtjenesten godtok ikke API-autentiseringen.',
 '403':'API-nøkkelen mangler rettighet, eller avsenderen er ikke godkjent.',
 '422':'Mailtjenesten avviste innholdet eller mottakeropplysningene.',
};
export function isInvoiceDeliveryIssue(delivery){
 return Boolean(delivery&&(['failed','bounced','suppressed'].includes(delivery.status)||delivery.status==='sent'&&delivery.detail?.delayed||delivery.status==='pending'&&delivery.failure_reason));
}

export function invoiceDeliveryIssues(invoices,{includeHistory=false}={}){
 return invoices.flatMap(invoice=>{
  const latest=invoice.deliveries.at(-1),active=!invoice.credit_number&&isInvoiceDeliveryIssue(latest);
  if(!includeHistory&&!active)return [];
  const deliveries=includeHistory?invoice.deliveries.filter(isInvoiceDeliveryIssue):[latest];
  return deliveries.length?[{invoice,deliveries,resolved:!active}]:[];
 });
}

export function suppressionExplanation(detail){
 const reasons={'blocklist':'Adressen eller domenet er blokkert i MailerSend.','hard-bounces':'Adressen er sperret etter en tidligere permanent leveringsfeil.',
  'spam-complaints':'Mottakeren har rapportert en tidligere melding som søppelpost.','unsubscribes':'Mottakeren er registrert som avmeldt.','on-hold-list':'MailerSend holder adressen tilbake etter leveringsproblemer.'};
 const reason=String(detail.reason||'').toLowerCase();
 const description=/does not exist/.test(reason)?'E-postkontoen finnes ikke ifølge mottakerens server.'
  :reason==='mailbox unavailable'?'Mottakerens postkasse er utilgjengelig.'
  :reason==='email banned or not exist'?'Adressen er sperret eller finnes ikke ifølge mottakerens server.'
  :!reason||reason==='unknown reason'?'MailerSend har ikke oppgitt en mer konkret årsak.':null;
 return [reasons[detail.type]||'Adressen er sperret hos MailerSend.',description].filter(Boolean).join(' ');
}
export function deliveryExplanation(detail={},failure){
 const code=detail.enhanced_code||(codes[String(detail.provider_code)]?detail.provider_code:null)||(codes[String(detail.http_status)]?detail.http_status:null)||detail.code||failure;
 return codes[String(code)] || (detail.bounce_code?`Tilbyders kode ${detail.bounce_code}. Se den oppgitte feilmeldingen; koden alene forklarer ikke årsaken.`:'Mailtjenesten har ikke gitt en kjent feilkode. Se hendelser og råmelding for det som er rapportert.');
}
export function webhookDeliveryDetail(payload){
 const meta=payload?.data?.meta||{};
 const reason=String(meta.bounce_reason||meta.suppression_reason||payload?.data?.email?.reason||'')
   .replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/https?:\/\/[^\s<>"']+/g,'[url]').replace(/[^\s<>"']+@[^\s<>"']+\.[^\s<>"']+/g,'[e-post]').slice(0,1500)||null;
 const code=meta.bounce_code;
 return {reason,bounce_code:(typeof code==='number'||typeof code==='string')?String(code).slice(0,100):null,
   bounce_type:['hard','soft'].includes(meta.bounce_type)?meta.bounce_type:null,
   enhanced_code:reason?.match(/\b[245]\.\d{1,3}\.\d{1,3}\b/)?.[0]||null,
   delayed:payload?.type==='activity.deferred'};
}

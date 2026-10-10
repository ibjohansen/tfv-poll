const codes={
 '5.1.1':'Mottakerens postkasse finnes ikke. Kontroller hoved-e-post med medlemmet.',
 '4.2.2':'Mottakerens postkasse er full. Mailtjenesten kan forsøke igjen.',
 '5.7.1':'Mottakerens server avviser meldingen av policy- eller sikkerhetsgrunner. Kontroller råmeldingen og avsenderoppsettet.',
 'MAILERSEND_DAILY_QUOTA':'Døgnkvoten er brukt opp. Vent til oppgitt tidspunkt for neste forsøk.',
 'MAILERSEND_RATE_LIMIT':'For mange API-kall. Neste forsøk utsettes til oppgitt tidspunkt.',
 'RECIPIENT_SUPPRESSED':'Adressen er sperret. Avklar årsaken før en ny adresse eller utsendelse brukes.',
 'UNCERTAIN_AFTER_INTERRUPTION':'Jobben ble avbrutt. Mailtjenesten kan ha mottatt meldingen. Kontroller meldingsloggen før du sender på nytt.',
 'MEMBER_CHANGED':'Medlemskap, hjemmelshaver, hjemmelsdato eller hoved-e-post er endret. Kontroller tomten før nytt sendeforsøk.',
 'INVOICE_CREDITED':'Fakturaen er kreditert og sendes ikke.',
 'UPSTREAM':'Mailtjenesten avviste forespørselen eller svarte ikke. Kontroller detaljene før et nytt forsøk.',
 '429':'Mailtjenestens kvote eller API-grense er nådd.',
 '401':'Mailtjenesten godtok ikke API-autentiseringen.',
 '403':'API-nøkkelen mangler rettighet, eller avsenderen er ikke godkjent.',
 '422':'Mailtjenesten avviste innholdet eller mottakeropplysningene.',
};
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

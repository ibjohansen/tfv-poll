const money=n=>new Intl.NumberFormat('nb-NO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
const date=d=>d.split('-').reverse().join('.');

export function invoicePropertyReference(value){
  const number=String(value||'').trim();
  return /^\d+$/.test(number)?`H-${number}`:number;
}

export const annualDuesBylaws = `§ 4 Medlemskap
Alle eiere (hjemmelshavere) av fritidsboliger/tomter i Turufjell hytteområde der Turufjell AS har solgt tomter regulert for hytteformål, er obligatorisk medlem av Vellet jfr. tinglysning på aktuelt gnr. bnr.

§ 5 Kontingent Medlemskontingent
Årsmøtet fastsetter medlemskontingenten. Medlem i henhold til grunnbokshjemmel den 1. februar i regnskapsåret er ansvarlig for innbetaling av kontingent til Vellet.

Ved for sen innbetaling av kontingent, kan Vellet legge til purregebyr og renter. Medlemmer som ikke har betalt kontingenten har verken talerett eller stemmerett på Vellets møter.`;

export function invoiceEmailSubject(invoice,{test=false}={}){
  return `${test?'TEST — ':''}Årskontingent ${invoice.year} – Turufjell Vel – ${invoice.number}`;
}

export function invoiceEmailContent(invoice,options={}) {
  const s=invoice.snapshot, text=`Hei ${s.recipient_name}.\n\nVedlagt finner du faktura ${invoice.number} for årskontingent ${invoice.year} for tomt ${s.h_number}.\nÅrskontingenten er ${money(invoice.amount_ore)} kroner. Betal innen ${date(invoice.due_on)} til konto ${s.sender.bank_account}, og merk betalingen med: ${invoice.number} og ${invoicePropertyReference(s.h_number)}.\n\nTa kontakt på ${s.sender.reply_to} dersom opplysningene trenger retting.\n\n${s.bylaws||annualDuesBylaws}\n\nVennlig hilsen\nTurufjell Vel`;
  return {subject:invoiceEmailSubject(invoice,options),text};
}

const money=n=>n%100===0?`${new Intl.NumberFormat('nb-NO',{maximumFractionDigits:0}).format(n/100)},-`
  :new Intl.NumberFormat('nb-NO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
const date=d=>d.split('-').reverse().join('.');
const bank=value=>String(value||'').replace(/^(\d{4})(\d{2})(\d{5})$/,'$1.$2.$3');

export function invoicePropertyReference(value){
  const number=String(value||'').trim();
  return /^\d+$/.test(number)?`H-${number}`:number;
}

export const annualDuesBylaws = `§ 4 Medlemskap
Alle eiere (hjemmelshavere) av fritidsboliger/tomter i Turufjell hytteområde der Turufjell AS har solgt tomter regulert for hytteformål, er obligatorisk medlem av Vellet jfr. tinglysning på aktuelt gårds- og bruksnummer.

§ 5 Kontingent Medlemskontingent
Årsmøtet fastsetter medlemskontingenten. Medlem i henhold til grunnbokshjemmel den 1. februar i regnskapsåret er ansvarlig for innbetaling av kontingent til Vellet.`;

export function invoiceEmailSubject(invoice,{test=false}={}){
  return `${test?'TEST — ':''}Årskontingent ${invoice.year} – Turufjell Vel – ${invoice.number}`;
}

export function invoiceEmailContent(invoice,options={}) {
  // Copies use the current approved email wording; archived PDFs and snapshots are unchanged.
  const s=invoice.snapshot, property=invoicePropertyReference(s.h_number);
  const text=`Til hjemmelshaver av\n${s.street_address||'Adresse ikke registrert'}, gårds- og bruksnummer ${s.cadastral_number||'Ikke registrert'}:\n${s.recipient_name}\n\n\nVedlagt finner du faktura ${invoice.number} for årskontingent ${invoice.year} for tomt ${property}.\nÅrskontingenten er ${money(invoice.amount_ore)} kroner. Betal innen ${date(invoice.due_on)} til konto ${bank(s.sender.bank_account)}, og merk betalingen med: "${invoice.number} og ${property}".\n\nBruk skjema på https://medlemsservice.turufjellvel.no/ eller ta kontakt på ${s.sender.reply_to} dersom opplysningene trenger retting.\n\nFra Vellets vedtekter:\n${annualDuesBylaws}\n\n\nVennlig hilsen\nTurufjell Vel`;
  return {subject:invoiceEmailSubject(invoice,options),text};
}

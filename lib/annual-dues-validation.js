import { AccountingError, accountingDate, accountingId, accountingYear, decimalUnits } from './accounting-validation.js';

export const financeMessages = {
  invoiceSettingsRequired: 'Lagre foreningens adresse og bankkonto under Innstillinger før fakturering.',
  invoiceSettingsChanged: 'Fakturainnstillingene er endret. Oppdater og kontroller opplysningene på nytt.',
  invalidBankAccount: 'Bankkontonummeret må ha 11 sifre og gyldig kontrollsiffer.',
  vatReviewRequired: 'Bekreft kampanjens avgiftsunntak for årskontingent.',
  campaignClosed: 'Kampanjen er avsluttet.',
  invalidPayment: 'Betalingsdatoen må være etter fakturadatoen og i det valgte betalingsåret.',
  invalidReversal: 'Korreksjonen må gjelde en opprinnelig betaling, ha samme beløp og tidligst dens betalingsdato.',
  invalidReplacement: 'Erstatningsfakturaen må vise til et kreditert krav for samme tomt og år.',
  missingInvoice: 'Fakturaen finnes ikke.',
  conflict: 'En faktura, referanse eller nummerserie er allerede brukt. Oppdater oversikten.',
  campaignAmountLocked: 'Årskontingenten er låst fordi det finnes en kampanje for året.',
  documentTooLong: 'Mottaker, adresse eller annen fakturatekst er for lang for dokumentet. Kontroller og forkort opplysningene.',
  ownershipDateExcluded: 'Hjemmelsdatoen gir ikke grunnlag for fakturering dette året. Se tomter som er holdt utenfor.',
  beforeCutoff: 'Årskontingenten kan tidligst faktureres 1. februar, når ansvarlig hjemmelshaver er fastsatt.',
  campaignExists: 'Det finnes allerede en kampanje for dette året.', financeYearClosed: 'Regnskapsåret er ikke åpnet eller er avsluttet.',
  campaignAmountMismatch: 'Kontingenten må samsvare med satsen som er lagret for regnskapsåret.',
  legacyFeesNeedReview: 'Tidligere fakturering eller betaltmarkeringer må avklares før en kampanje kan åpnes.',
  memberChanged: 'Medlemsopplysningene har endret seg. Last inn på nytt og kontroller mottakeren.',
  numberConflict: 'Nummerserien har endret seg. Last inn på nytt og prøv igjen.',
  deliveryPending: 'Et sendeforsøk er i kø eller under behandling. Avklar det før du fortsetter.',
  ownerReviewRequired: 'Hjemmelshaver er endret. Kontroller hvem som skal motta denne fakturaen.',
  invoiceSettled: 'Fakturaen er betalt eller kreditert.', overpayment: 'Beløpet overstiger det ubetalte kravet.',
  previousYearNotClosed: 'Det gamle regnskapsåret må avsluttes først.',
  creditHasPayments: 'Registrerte betalinger må korrigeres før fakturaen kan krediteres.',
  useDocumentedPayments: 'Bruk dokumenterte betalinger for fakturaene i denne kampanjen.',
  reviewedRequired: 'Bekreft at mottaker, fakturaadresse og grunnlag er kontrollert.',
  sendingDisabled: 'Fakturautsendelse er ikke aktivert for dette miljøet.',
  unavailable: 'Kunne ikke hente eller lagre opplysningene. Prøv igjen.',
};
export const financeText = (value, max=2000) => {
  if (typeof value!=='string' || !value.trim() || value.trim().length>max || /[\u0000-\u001f\u007f]/.test(value)) throw new AccountingError('invalidInput');
  return value.trim();
};
export function invoiceEmail(value) {
  const email=String(value||'').trim().toLowerCase();
  if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountingError('invalidInput');
  return email;
}
export function financeDate(value,year) {
  const date=accountingDate(value);
  if (Number(date.slice(0,4))!==accountingYear(year)) throw new AccountingError('wrongYear');
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo'}).format(new Date());
  if (date>today) throw new AccountingError('invalidDate');
  return date;
}
// The dues period and actual issue date differ when the campaign stays open past New Year.
export function invoiceIssueDate(value,year) {
  const date=accountingDate(value),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo'}).format(new Date());
  if(date<`${accountingYear(year)}-02-01`)throw new AccountingError('beforeCutoff');
  if(date>today)throw new AccountingError('invalidDate');
  return date;
}
export function invoiceBankAccount(value) {
  const bank=String(value||'').replace(/[ .]/g,'');
  const weights=[5,4,3,2,7,6,5,4,3,2];
  const control=11-weights.reduce((s,w,i)=>s+w*Number(bank[i]),0)%11;
  if (!/^\d{11}$/.test(bank) || control===10 || (control===11?0:control)!==Number(bank[10])) throw new AccountingError('invalidBankAccount');
  return bank;
}
export function invoiceSenderAddress(value) {
  const address=String(value||'').replace(/\r\n?/g,'\n').trim();
  if(!address||address.length>320||/[\u0000-\u0009\u000b-\u001f\u007f]/.test(address))throw new AccountingError('invalidInput');
  return address;
}
export function invoiceSettingsInput(input) {
  if(!Number.isInteger(input.version)||input.version<0||input.version>=2147483647)throw new AccountingError('invalidInput');
  const organization=String(input.organization_number||'').replace(/\s/g,'');
  if(!/^\d{9}$/.test(organization))throw new AccountingError('invalidInput');
  const website=financeText(input.website,120);let url;
  try{url=new URL(website.startsWith('http')?website:`https://${website}`);}catch{throw new AccountingError('invalidInput');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.hostname.includes('.'))throw new AccountingError('invalidInput');
  const phone=financeText(input.phone,30);if(!/^[+0-9 ()-]{6,30}$/.test(phone))throw new AccountingError('invalidInput');
  return {version:input.version,sender_address:invoiceSenderAddress(input.sender_address),bank_account:invoiceBankAccount(input.bank_account),
    contact:{name:financeText(input.name,160),organization_number:organization,phone,reply_to:invoiceEmail(input.reply_to),website}};
}
export function campaignInput(input) {
  if (input.reviewed!==true) throw new AccountingError('reviewedRequired');
  if(input.vat_exempt!==true)throw new AccountingError('vatReviewRequired');
  const year=accountingYear(input.year), amount=decimalUnits(input.amount,2,100000000);
  if (!amount || !/^[A-Z0-9-]{1,20}$/.test(input.prefix||'') || !Number.isInteger(input.first_number) || input.first_number<1 || input.first_number>99999998) throw new AccountingError('invalidInput');
  const bank=invoiceBankAccount(input.bank_account);
  return {year,amount,prefix:input.prefix,first:input.first_number,sender:{name:'Turufjell Vel',organization_number:'928968898',
    address:invoiceSenderAddress(input.sender_address),bank_account:bank,reply_to:invoiceEmail(input.reply_to),vat:'Årskontingent unntatt merverdiavgift'}};
}
export function paymentInput(input) {
  const year=accountingYear(input.payment_year), amount=decimalUnits(input.amount,2,100000000);
  if (!amount) throw new AccountingError('invalidAmount');
  return {id:accountingId(input.id),invoice:accountingId(input.invoice_id),year,date:financeDate(input.date,year),amount,
    reference:financeText(input.reference,500),evidence:financeText(input.evidence),reverses:input.reverses_id?accountingId(input.reverses_id):null};
}

import { AccountingError, accountingDate, accountingId, accountingYear, decimalUnits } from './accounting-validation.js';

export const financeMessages = {
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
export function campaignInput(input) {
  if (input.reviewed!==true) throw new AccountingError('reviewedRequired');
  const year=accountingYear(input.year), amount=decimalUnits(input.amount,2,100000000);
  if (!amount || !/^[A-Z0-9-]{1,20}$/.test(input.prefix||'') || !Number.isInteger(input.first_number) || input.first_number<1 || input.first_number>99999998) throw new AccountingError('invalidInput');
  const bank=String(input.bank_account||'').replace(/[ .]/g,'');
  const weights=[5,4,3,2,7,6,5,4,3,2];
  const control=11-weights.reduce((s,w,i)=>s+w*Number(bank[i]),0)%11;
  if (!/^\d{11}$/.test(bank) || control===10 || (control===11?0:control)!==Number(bank[10])) throw new AccountingError('invalidInput');
  return {year,amount,prefix:input.prefix,first:input.first_number,sender:{name:'Turufjell Vel',organization_number:'928968898',
    address:financeText(input.sender_address,320),bank_account:bank,reply_to:invoiceEmail(input.reply_to),vat:'Medlemskontingent unntatt merverdiavgift'}};
}
export function paymentInput(input) {
  const year=accountingYear(input.payment_year), amount=decimalUnits(input.amount,2,100000000);
  if (!amount) throw new AccountingError('invalidAmount');
  return {id:accountingId(input.id),invoice:accountingId(input.invoice_id),year,date:financeDate(input.date,year),amount,
    reference:financeText(input.reference,500),evidence:financeText(input.evidence),reverses:input.reverses_id?accountingId(input.reverses_id):null};
}

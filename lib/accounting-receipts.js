import { decimalUnits, decimalString } from './accounting-validation.js';

const suppliers = [
  ['Mailchimp', /mailchimp|rocket science group/i, 'systems'],
  ['Microsoft', /microsoft|office 365|msbill\.info/i, 'systems'],
  ['Netlify', /netlify/i, 'systems'], ['Neon', /\bneon\b/i, 'systems'],
  ['MailerSend', /mailersend/i, 'systems'], ['Hallingdølen', /hallingd[oø]len/i, 'other'],
];

function money(value) {
  let cleaned = value.replace(/[ \u00a0]/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) cleaned = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
    ? cleaned.replaceAll('.', '').replace(',', '.') : cleaned.replaceAll(',', '');
  try { return decimalString(decimalUnits(cleaned)); } catch { return ''; }
}

function date(value) {
  if (!value) return '';
  let result;
  const european = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](20\d{2})$/);
  if (european) result = `${european[3]}-${european[2].padStart(2, '0')}-${european[1].padStart(2, '0')}`;
  else if (/^20\d{2}-\d{2}-\d{2}$/.test(value)) result = value;
  else {
    const parsed = new Date(`${value} UTC`);
    if (Number.isFinite(parsed.getTime())) result = parsed.toISOString().slice(0, 10);
  }
  if (!result) return '';
  const parsed = new Date(`${result}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : '';
}

// Port of the supplied scanner's vendor rules. Suggestions NEVER set a
// reimbursement/payment status or an exchange rate for a foreign currency.
export function suggestReceipt(text = '', filename = '') {
  const supplier = suppliers.find(([, pattern]) => pattern.test(`${filename}\n${text}`));
  const result = { supplier: supplier?.[0] ?? '', category: supplier?.[2] ?? 'other', amount: '', currency: '', invoice_date: '', invoice_number: '', confidence: 'manual' };
  let match;
  if (result.supplier === 'Microsoft') {
    match = text.match(/^\s*([0-9][0-9 .]*[,.][0-9]{2})\s+NOK\s*$/m);
    if (match) { result.amount = money(match[1]); result.currency = 'NOK'; }
  } else if (result.supplier === 'Netlify') {
    match = text.match(/Amount\s+paid\s*(?:\n|:)\s*\$\s*([0-9][0-9.,]*)/i);
    if (match) { result.amount = money(match[1]); result.currency = 'USD'; }
  } else if (result.supplier === 'Hallingdølen') {
    match = text.match(/Total\s+sum\s*:\s*([0-9][0-9 .]*[,.][0-9]{2})/i);
    if (match) { result.amount = money(match[1]); result.currency = 'NOK'; }
  } else if (result.supplier === 'Mailchimp') {
    const block = text.match(/Billing\s+statement([\s\S]*?)(?:Balance\s+as\s+of|Paid\s+via|$)/i);
    const values = block ? [...block[1].matchAll(/\$\s*([0-9][0-9.,]*)/g)].map((entry) => money(entry[1])) : [];
    if (values.length && values.every(Boolean)) { result.amount = decimalString(values.reduce((sum, value) => sum + decimalUnits(value), 0)); result.currency = 'USD'; }
  }
  if (result.amount) result.confidence = 'vendor';
  if (!result.amount) {
    // Only an explicitly labelled total with a currency is eligible. Conflicting
    // totals are left blank, and payment-card identifiers are always excluded.
    const candidates = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/amount paid|amount due|grand total|invoice total|total amount|total sum|fakturabeløp|totalt|^total\b/i.test(lines[i])) continue;
      const context = `${lines[i]} ${lines[i + 1] ?? ''}`;
      if (/ending in|\bcard\b|mastercard|visa|\bmast\b/i.test(context)) continue;
      const amount = context.match(/(?:\b(USD|EUR|GBP|NOK|SEK|DKK)\b|([$€£]))\s*(\d+(?:[.,]\d{2})?)(?![\d.,])|(?<![\d.,])(\d+(?:[.,]\d{2})?)\s*\b(USD|EUR|GBP|NOK|SEK|DKK)\b/i);
      if (amount) candidates.push({ amount: money(amount[3] || amount[4]), currency: (amount[1] || amount[5] || ({ '$': 'USD', '€': 'EUR', '£': 'GBP' }[amount[2]])).toUpperCase() });
    }
    const unique = [...new Map(candidates.filter((entry) => entry.amount).map((entry) => [`${entry.currency}:${entry.amount}`, entry])).values()];
    if (unique.length === 1) Object.assign(result, unique[0], { confidence: 'suggested' });
  }
  const dateMatch = text.match(/(?:invoice\s+date|fakturadato|faktura\s+dato|payment\s+date|date\s+paid|date\s+issued?)\s*[:#]?\s*(20\d{2}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]20\d{2}|[A-Za-z]{3,10}\s+\d{1,2},?\s+20\d{2})/i);
  result.invoice_date = date(dateMatch?.[1]);
  result.invoice_number = text.match(/(?:invoice\s*(?:number|no\.?|#)|fakturanr\.?|fakturanummer|invoice id|receipt\s*(?:number|no\.?|#)|receipt id)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,})/i)?.[1] ?? '';
  if (!result.invoice_number && result.supplier === 'Mailchimp') result.invoice_number = filename.match(/mailchimp-receipt-(MC\d+)\.pdf$/i)?.[1] ?? '';
  if (!result.invoice_number && result.supplier === 'MailerSend') result.invoice_number = text.match(/^\s*Invoice\s+(\d+(?:-\d+)+)\s*$/im)?.[1] ?? '';
  return result;
}

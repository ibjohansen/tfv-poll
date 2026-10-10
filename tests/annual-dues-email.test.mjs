import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceEmailContent } from '../lib/annual-dues-email.js';
import { sendEmail } from '../lib/mailer-service.js';

const sample=()=>({year:2026,number:'AK-2026-5',due_on:'2026-10-24',amount_ore:25000,
  snapshot:{recipient_name:'Eksempelmedlem',street_address:'Eksempelvegen 16',cadastral_number:'10/725',h_number:'25',
    bylaws:'Eldre utdrag om purregebyr, renter og stemmerett.',
    sender:{bank_account:'10805535682',reply_to:'post@turufjellvel.no'}}});

test('provider receives the approved dues email and one system footer, including on copies of older invoices',async()=>{
  const invoice=sample(),before=structuredClone(invoice);
  let payload;
  await sendEmail({to:'member@example.test',...invoiceEmailContent(invoice,{test:true})},{
    env:{MAILERSEND_ENABLED:'true',MAILERSEND_API_TOKEN:'synthetic-token',MAILERSEND_DOMAIN_ID:'synthetic-domain',
      MAILERSEND_FROM_EMAIL:'post@turufjellvel.no',MAILERSEND_FROM_NAME:'Turufjell Vel'},
    fetchImpl:async(url,options)=>{
      assert.equal(url,'https://api.mailersend.com/v1/email');
      payload=JSON.parse(options.body);
      return new Response(null,{status:202,headers:{'x-message-id':'synthetic-test-message'}});
    },
  });
  assert.equal(payload.subject,'TEST — Årskontingent 2026 – Turufjell Vel – AK-2026-5');
  assert.equal(payload.text,`Til hjemmelshaver av
Eksempelvegen 16, gårds- og bruksnummer 10/725:
Eksempelmedlem


Vedlagt finner du faktura AK-2026-5 for årskontingent 2026 for tomt H-25.
Årskontingenten er 250,- kroner. Betal innen 24.10.2026 til konto 1080.55.35682, og merk betalingen med: "AK-2026-5 og H-25".

Bruk skjema på https://medlemsservice.turufjellvel.no/ eller ta kontakt på post@turufjellvel.no dersom opplysningene trenger retting.

Fra Vellets vedtekter:
§ 4 Medlemskap
Alle eiere (hjemmelshavere) av fritidsboliger/tomter i Turufjell hytteområde der Turufjell AS har solgt tomter regulert for hytteformål, er obligatorisk medlem av Vellet jfr. tinglysning på aktuelt gårds- og bruksnummer.

§ 5 Kontingent Medlemskontingent
Årsmøtet fastsetter medlemskontingenten. Medlem i henhold til grunnbokshjemmel den 1. februar i regnskapsåret er ansvarlig for innbetaling av kontingent til Vellet.


Vennlig hilsen
Turufjell Vel

Denne e-posten er sendt fra Medlemsservice i Turufjell Vel.`);
  assert.doesNotMatch(payload.text,/Hei |purregebyr|stemmerett|inkasso|gnr\. bnr\./i);
  assert.deepEqual(invoice,before);
});

test('email uses the invoice values and preserves formatted property numbers and fractional amounts',()=>{
  const invoice=sample();Object.assign(invoice,{year:2027,number:'AK-2027-12',due_on:'2027-02-18',amount_ore:30050});
  invoice.snapshot.h_number='SPG H 1';invoice.snapshot.sender.bank_account='86011117947';
  const {subject,text}=invoiceEmailContent(invoice);
  assert.equal(subject,'Årskontingent 2027 – Turufjell Vel – AK-2027-12');
  assert.match(text,/faktura AK-2027-12 for årskontingent 2027 for tomt SPG H 1\./);
  assert.match(text,/300,50 kroner\. Betal innen 18\.02\.2027 til konto 8601\.11\.17947/);
  assert.match(text,/"AK-2027-12 og SPG H 1"/);
  assert.doesNotMatch(text,/H-SPG|250,-|AK-2026|TEST/);
});

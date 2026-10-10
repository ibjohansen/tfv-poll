import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { invoicePdf } from '../lib/annual-dues-documents.js';
import { invoiceEmailContent, invoicePropertyReference } from '../lib/annual-dues-email.js';

const sample=hNumber=>({year:2026,number:'AK-2026-1',issued_on:'2026-10-10',due_on:'2026-10-24',amount_ore:25000,
  snapshot:{recipient_name:'Eksempelmedlem',street_address:'Eksempelvegen 16',cadastral_number:'10/725',
    invoice_address:'medlem@example.test',h_number:hNumber,sender:{name:'Turufjell Vel',address:'Eksempelvegen 1\n0000 Eksempel',
      bank_account:'86011117947',organization_number:'928968898',reply_to:'post@example.test',vat:'Årskontingent unntatt merverdiavgift'}}});

for(const [number,reference] of [['25','H-25'],['SPG H 1','SPG H 1'],['H-25','H-25'],['H101','H101']]){
  test(`invoice and email use payment reference ${reference}`,async()=>{
    const invoice=sample(number),{bytes}=await invoicePdf(invoice);
    const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,verbosity:0});
    try{
      const pdf=await task.promise;assert.equal(pdf.numPages,1);
      const page=await pdf.getPage(1),{items}=await page.getTextContent();
      const text=items.map(item=>item.str).join('\n');
      const recipientLines=['Eksempelmedlem','Eksempelvegen 16','Gårds- og bruksnummer: 10/725','medlem@example.test'];
      let previousY=Infinity;
      for(const line of recipientLines){
        const item=items.find(item=>item.str===line);assert.ok(item,`Missing recipient line: ${line}`);
        assert.ok(item.transform[5]<previousY);assert.ok(item.transform[5]>560);previousY=item.transform[5];
      }
      assert.match(text,/Periode: 01\.01\.2026 – 31\.12\.2026/);
      assert.ok(items.some(item=>item.str==='Årskontingent 2026'&&item.transform[5]===438));
      assert.doesNotMatch(text,/Årskontingent 2026 ·/);
      const payment=`Merk betalingen med: AK-2026-1 og ${reference}.`;
      assert.ok(text.includes(payment));
      assert.ok(invoiceEmailContent(invoice).text.includes(`merk betalingen med: "AK-2026-1 og ${reference}".`));
      assert.equal(invoicePropertyReference(number),reference);
    }finally{await task.destroy();}
  });
}

for(const recipient of ['ALEXANDER EKSEMPELSEN / '.repeat(6).slice(0,-3),'W'.repeat(150)]){
  test(`long recipient names are visibly shortened without overlapping property details (${recipient.length} characters)`,async()=>{
    const invoice=sample('209');invoice.snapshot.recipient_name=recipient;
    const before=structuredClone(invoice),document=await invoicePdf(invoice);
    assert.equal(document.recipientNameTruncated,true);assert.deepEqual(invoice,before);
    const task=getDocument({data:new Uint8Array(document.bytes),isEvalSupported:false,useSystemFonts:false,verbosity:0});
    try{
      const pdf=await task.promise;assert.equal(pdf.numPages,1);
      const {items}=await (await pdf.getPage(1)).getTextContent();
      const names=items.filter(item=>item.str&&item.transform[0]===12&&item.transform[4]===52&&item.transform[5]>=639&&item.transform[5]<=675);
      assert.ok(names.length<=3);assert.ok(names.at(-1).str.endsWith('…'));
      const printed=names.map(item=>item.str).join(' ');
      assert.ok(recipient.startsWith(printed.slice(0,-1)));assert.ok(printed.length<recipient.length);
      for(const item of names)assert.ok(item.transform[4]+item.width<=302.01);
      for(const line of ['Eksempelvegen 16','Gårds- og bruksnummer: 10/725','medlem@example.test']){
        const item=items.find(item=>item.str===line);assert.ok(item);assert.ok(item.transform[5]<names.at(-1).transform[5]);assert.ok(item.transform[5]>560);
      }
    }finally{await task.destroy();}
  });
}

test('ordinary recipient names do not need a truncation notice',async()=>{
  assert.equal((await invoicePdf(sample('25'))).recipientNameTruncated,false);
});

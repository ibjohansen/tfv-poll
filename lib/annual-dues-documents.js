import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { invoicePropertyReference } from './annual-dues-email.js';

const money=n=>n===null?'Ikke registrert':new Intl.NumberFormat('nb-NO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
const date=d=>d.split('-').reverse().join('.');
let regular,bold,logo;
async function assets(){
  [regular,bold,logo]=await Promise.all([
    regular||readFile(join(process.cwd(),'public/fonts/LiberationSans-Regular.ttf')),
    bold||readFile(join(process.cwd(),'public/fonts/LiberationSans-Bold.ttf')),
    logo||sharp(await readFile(join(process.cwd(),'public/Turufjell_liggende_VEL_logo_brun.svg'))).resize({width:700}).png().toBuffer(),
  ]);
}
export async function invoicePdf(invoice,{credit=null}={}) {
  await assets();
  const pdf=await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const normal=await pdf.embedFont(regular,{subset:true}), strong=await pdf.embedFont(bold,{subset:true});
  const page=pdf.addPage([595.28,841.89]), image=await pdf.embedPng(logo), ink=rgb(.27,.24,.22), rose=rgb(.62,.36,.45);
  page.drawImage(image,{x:335,y:756,width:208,height:208*image.height/image.width});
  const draw=(text,x,y,size=11,font=normal)=>page.drawText(String(text),{x,y,size,font,color:ink});
  const lines=(text,width,size,font)=>{
    const result=[];
    for(const paragraph of String(text).split(/\r?\n/)){
      let line='';
      for (const word of paragraph.split(/\s+/)){
        if (font.widthOfTextAtSize(word,size)>width) throw new Error('invoiceTextTooLong');
        if (line && font.widthOfTextAtSize(`${line} ${word}`,size)>width){result.push(line);line='';}
        line+=(line?' ':'')+word;
      }
      result.push(line);
    }
    return result;
  };
  const wrap=(text,x,y,width,size=11,font=normal)=>{
    for(const line of lines(text,width,size,font)){if(line)draw(line,x,y,size,font);y-=size*1.5;}
    return y;
  };
  const s=invoice.snapshot, sender=s.sender, number=credit?.number||invoice.number, issued=credit?.issued_on||invoice.issued_on;
  draw(credit?'Kreditnota':'Faktura',52,772,27,strong);draw(`Årskontingent ${invoice.year}`,52,737,15,strong);
  // Reserve the remaining recipient block for address, cadastral number and email.
  // Keep the complete name in the snapshot; only the printed name is shortened.
  const nameCharacters=Array.from(s.recipient_name);
  let recipientName=s.recipient_name,remaining=nameCharacters.length;
  for(;;){
    try{if(lines(recipientName,250,12,strong).length<=3)break;}
    catch(error){if(error.message!=='invoiceTextTooLong')throw error;}
    recipientName=nameCharacters.slice(0,--remaining).join('').trimEnd()+'…';
  }
  const recipientNameTruncated=recipientName!==s.recipient_name;
  let y=wrap(recipientName,52,675,250,12,strong);
  y=wrap(s.street_address||'',52,y,250);
  y=wrap(`Gårds- og bruksnummer: ${s.cadastral_number||'Ikke registrert'}`,52,y,250);
  y=wrap(s.invoice_address,52,y-8,250);
  if(y<560)throw new Error('invoiceTextTooLong');
  draw(`Tomt: ${s.h_number}`,52,552);
  wrap(`${credit?'Kreditnotanummer':'Fakturanummer'}: ${number}`,335,690,208,10);
  draw(`Dato: ${date(issued)}`,340,653,10);
  if(!credit)draw(`Forfall: ${date(invoice.due_on)}`,340,631,10);
  draw(`Periode: 01.01.${invoice.year} – 31.12.${invoice.year}`,340,609,10);
  if(credit)wrap(`Gjelder faktura: ${invoice.number}`,335,587,208,10);
  page.drawRectangle({x:52,y:460,width:491,height:37,color:rgb(.95,.93,.9)});
  draw('Beskrivelse',64,475,11,strong);draw('Antall',370,475,11,strong);draw('Beløp NOK',450,475,11,strong);
  wrap(`Årskontingent ${invoice.year}`,64,438,287);draw('1',385,438);
  const value=`${credit?'-':''}${money(invoice.amount_ore)}`;draw(value,535-normal.widthOfTextAtSize(value,11),438);
  draw(sender.vat,52,377,10);
  page.drawLine({start:{x:52,y:355},end:{x:543,y:355},thickness:1,color:rose});
  draw(credit?'Kreditert beløp':'Å betale',52,323,16,strong);const total=`${value} kr`;draw(total,543-strong.widthOfTextAtSize(total,18),323,18,strong);
  if(credit){wrap(`Årsak: ${credit.reason}`,52,283,491,11);}
  else {
    draw(`Betal til ${sender.name}`,52,270,12,strong);draw(`Bankkonto: ${sender.bank_account}`,52,246,12);
    wrap(`Merk betalingen med: ${number} og ${invoicePropertyReference(s.h_number)}.`,52,222,491);
  }
  const addressY=wrap(sender.name,52,160,245,12,strong);
  const address=sender.address.split(/\r?\n/);if(address[0].trim().toLocaleLowerCase('nb-NO')===sender.name.toLocaleLowerCase('nb-NO'))address.shift();
  const footer=wrap(address.join('\n'),52,addressY-4,245,10);if(footer<45)throw new Error('invoiceTextTooLong');
  let contactY=wrap(`Org.nr. ${sender.organization_number}`,335,160,208,10);
  if(sender.phone)contactY=wrap(`Telefon: ${sender.phone}`,335,contactY-4,208,10);
  contactY=wrap(sender.reply_to,335,contactY-4,208,10);
  if(sender.website)contactY=wrap(sender.website,335,contactY-4,208,10);
  if(contactY<45)throw new Error('invoiceTextTooLong');
  pdf.setTitle(`${credit?'Kreditnota':'Årskontingent'} ${invoice.year} ${number}`);pdf.setAuthor('Turufjell Vel');
  // Stable metadata: repeated generation from the snapshot does not change dates.
  pdf.setCreationDate(new Date(`${issued}T12:00:00Z`));pdf.setModificationDate(new Date(`${issued}T12:00:00Z`));
  const bytes=Buffer.from(await pdf.save());return {bytes,sha256:createHash('sha256').update(bytes).digest('hex'),recipientNameTruncated};
}
export { annualDuesBylaws, invoiceEmailContent } from './annual-dues-email.js';

function reportSections(report){
  return [
    {title:`Resultat ${report.year}`,headers:['Konto','Beskrivelse',`Regnskap ${report.year}`,`Budsjett ${report.budget_year}`],rows:[
      ...report.result.map(a=>[a.code,a.name,money(a.actual_ore),money(a.budget_ore)]),
      ['', 'Sum inntekter',money(report.income_ore),''],['','Sum kostnader',money(report.cost_ore),''],['','Årsresultat',money(report.result_ore),'']]},
    {title:`Balanse per 31.12.2025`,headers:['Konto','Beskrivelse','Beløp'],rows:[
      ...report.balance.map(a=>[a.code,a.name,money(a.balance_ore)]),
      ['','Sum eiendeler',money(report.assets_ore)],['','Sum egenkapital og gjeld',money(report.equity_liabilities_ore)]]},
    {title:`Budsjett ${report.budget_year}`,headers:['Konto','Beskrivelse','Budsjett'],rows:report.result.map(a=>[a.code,a.name,money(a.budget_ore)])},
  ];
}
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export async function financePng(report,kind){
  const section=reportSections(report)[{result:0,balance:1,budget:2}[kind]];
  if(!section)throw new Error('invalidInput');
  const lines=[section.headers,...section.rows], height=235+lines.length*42;
  const xs=section.headers.length===4?[50,155,740,980]:[50,155,980];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}"><rect width="1080" height="${height}" fill="white"/>
    <g font-family="Arial, sans-serif" fill="#292524"><text x="50" y="55" font-size="26">Turufjell Vel</text><text x="50" y="100" font-size="30" font-weight="bold">${xml(section.title)}</text>
    <text x="50" y="140" font-size="16">${kind==='balance'?'Historisk balanse fra siste årsrapport':kind==='budget'?`Budsjett ${report.budget_year}`:(report.year===2025?'Regnskap fra siste årsrapport':`Foreløpig regnskap ${report.year}`)} · NOK</text>
    ${lines.map((row,i)=>`<rect x="40" y="${162+i*42}" width="1000" height="42" fill="${i===0?'#f0ede8':i%2?'#faf9f7':'white'}"/>${row.map((cell,c)=>`<text x="${xs[c]}" y="${190+i*42}" font-size="18" text-anchor="${c>=2?'end':'start'}"${i===0?' font-weight="bold"':''}>${xml(cell)}</text>`).join('')}`).join('')}
    <text x="50" y="${height-24}" font-size="14">Generert ${date(report.generated_on)} · Balanse fra Protokoll-2026.pdf · bankavstemming kommer senere</text></g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

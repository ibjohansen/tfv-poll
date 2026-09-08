import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMembersCsv } from '../lib/import-members.js';
const header = 'H-nummer;Matrikkel-GNR/BR;Tomt/Adresse;Matrikkel-tinglyst dato;Matrikkel-eier;Navn;Hoved-epost;Extra-epost;Kommentar';
const row = (h='H1', cadastral='1/1', address='Test 1') => `${h};${cadastral};${address};01.01.2020 / 02.02.2021;Eier A / Eier B;Ignorert kontaktnavn;a@example.com;b@example.com / c@example.com;"Privat; kommentar"`;
test('CSV rules retain N/A separately, preserve owner/date/comment, and skip incomplete rows', () => {
 const source = '\ufeff;;;;;;;;\r\n' + header + '\r\n' + [row(),row('N/A','1/2','Test 2'),row('N/A','1/3','Test 3'),row(''),row('H4','','Test 4'),row('H5','1/5','')].join('\r\n');
 const {members,skipped}=parseMembersCsv(source);
 assert.equal(members.length,3); assert.equal(skipped.length,3);
 assert.notEqual(members[1].import_key,members[2].import_key);
 assert.equal(members[0].registration_date,'01.01.2020 / 02.02.2021');
 assert.equal(members[0].title_holder,'Eier A / Eier B');
 assert.equal(members[0].primary_contact_name,'Eier A / Eier B');
 assert.equal(members[0].admin_comment,'Privat; kommentar');
 assert.deepEqual(members[0].other_contact_emails,['b@example.com','c@example.com']);
});
test('assignment of H-number retains the import identity', () => {
 const before=parseMembersCsv(header+'\n'+row('N/A')).members[0];
 const after=parseMembersCsv(header+'\n'+row('H9')).members[0];
 assert.equal(before.import_key,after.import_key);
});
test('ambiguous duplicate records and missing columns fail before writes', () => {
 assert.throws(()=>parseMembersCsv(header+'\n'+row()+'\n'+row()),/duplisert/);
 assert.throws(()=>parseMembersCsv('H-nummer;Adresse\nH1;Test'),/Mangler kolonnen/);
});

test('Navn is ignored and is not required, even when the owner is missing', () => {
 const withoutName = header.replace(';Navn', '') + '\n' + row().replace(';Ignorert kontaktnavn', '');
 assert.equal(parseMembersCsv(withoutName).members[0].primary_contact_name, 'Eier A / Eier B');
 const missingOwner = header + '\n' + row().replace('Eier A / Eier B;', ';');
 assert.equal(parseMembersCsv(missingOwner).members[0].primary_contact_name, null);
});

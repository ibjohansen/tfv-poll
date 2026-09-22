import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildMemberWorkbook } from '../lib/member-workbook.js';

test('member workbook includes member fields without survey data, personal links or internal metadata', async () => {
  const member = {
    id: '25',
    access_token: '11111111111111111111111111111111',
    h_number: '25',
    cadastral_number: '10/371',
    section_number: '4',
    street_address: 'Turufjellvegen 382',
    title_holder: 'OLA NORDMANN / KARI NORDMANN',
    registration_date: '2024-01-12 / 2024-01-12',
    primary_contact_name: 'Ola',
    primary_contact_email: 'ola@example.no',
    other_contact_emails: ['kari@example.no'],
    membership_status: 'member',
    hamlet_name: 'Slåtta',
    admin_comment: 'Test',
    import_key: 'import-25',
    access_expires_at: '2027-01-01T00:00:00.000Z',
    access_revoked_at: null,
    deleted_at: null,
    has_responded: false,
  };
  const buffer = await buildMemberWorkbook({ members: [member] });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Medlemmer');
  const headerValues = sheet.getRow(1).values.slice(1);
  const headers = Object.fromEntries(headerValues.map((header, index) => [header, index + 1]));
  const row = sheet.getRow(2);

  assert.deepEqual(headerValues, [
    'H-nummer',
    'Gårds- og bruksnummer',
    'Seksjonsnummer',
    'Gateadresse',
    'Hjemmelshaver',
    'Tinglysningsdato',
    'Kontaktperson',
    'Hoved-e-post',
    'Andre e-postadresser',
    'Medlemsstatus',
    'Grend',
  ]);
  assert.equal(row.getCell(headers['H-nummer']).value, 25);
  assert.equal(row.getCell(headers['Gårds- og bruksnummer']).value, '10/371');
  assert.equal(row.getCell(headers['Seksjonsnummer']).value, '4');
  assert.equal(row.getCell(headers['Gateadresse']).value, 'Turufjellvegen 382');
  assert.equal(row.getCell(headers['Hjemmelshaver']).value, 'OLA NORDMANN / KARI NORDMANN');
  assert.equal(row.getCell(headers['Tinglysningsdato']).value, '2024-01-12 / 2024-01-12');
  assert.equal(row.getCell(headers['Kontaktperson']).value, 'Ola');
  assert.equal(row.getCell(headers['Hoved-e-post']).value, 'ola@example.no');
  assert.equal(row.getCell(headers['Andre e-postadresser']).value, 'kari@example.no');
  assert.equal(row.getCell(headers['Medlemsstatus']).value, 'Ordinært medlem');
  assert.equal(row.getCell(headers['Grend']).value, 'Slåtta');
  for (const excludedHeader of [
    'Intern database-ID',
    'Kommentar',
    'Importnøkkel',
    'Medlems-secret',
    'Secret utløper',
    'Secret tilbakekalt',
    'Slettet',
    'Reservert mot deling med Turufjell AS',
  ]) {
    assert.equal(headers[excludedHeader], undefined);
  }
  for (const surveyHeader of ['Har svart', 'Undersøkelse', 'Undersøkelses-ID', 'Personlig undersøkelseslenke']) {
    assert.equal(headers[surveyHeader], undefined);
  }
});

test('non-numeric H-numbers remain text in the workbook', async () => {
  const member = {
    id: '9007199254740992',
    h_number: 'H-25',
    access_token: '11111111111111111111111111111111',
    other_contact_emails: [],
    has_responded: false,
  };
  const buffer = await buildMemberWorkbook({ members: [member] });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const row = workbook.getWorksheet('Medlemmer').getRow(2);
  assert.equal(row.getCell(1).value, member.h_number);
});

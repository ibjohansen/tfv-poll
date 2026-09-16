import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildMemberWorkbook } from '../lib/member-workbook.js';

test('member workbook includes member fields without personal survey secrets or internal metadata', async () => {
  const member = {
    id: '25',
    access_token: '11111111111111111111111111111111',
    h_number: '25',
    cadastral_number: '10/371',
    street_address: 'Turufjellvegen 382',
    title_holder: 'OLA NORDMANN / KARI NORDMANN',
    registration_date: '2024-01-12 / 2024-01-12',
    primary_contact_name: 'Ola',
    primary_contact_email: 'ola@example.no',
    other_contact_emails: ['kari@example.no'],
    admin_comment: 'Test',
    import_key: 'import-25',
    access_expires_at: '2027-01-01T00:00:00.000Z',
    access_revoked_at: null,
    deleted_at: null,
    has_responded: false,
  };
  const survey = { id: '22222222222222222222222222222222', title: 'Testundersøkelse' };
  const buffer = await buildMemberWorkbook({ members: [member], survey, baseUrl: 'https://example.no' });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Medlemmer');
  const headers = Object.fromEntries(sheet.getRow(1).values.slice(1).map((header, index) => [header, index + 1]));
  const row = sheet.getRow(2);

  assert.equal(row.getCell(headers['H-nummer']).value, 25);
  assert.equal(row.getCell(headers['Andre e-postadresser']).value, 'kari@example.no');
  assert.equal(row.getCell(headers['Har svart']).value, 'Nei');
  assert.equal(row.getCell(headers['Reservert mot deling med Turufjell AS']).value, 'Nei');
  for (const excludedHeader of [
    'Intern database-ID',
    'Kommentar',
    'Importnøkkel',
    'Medlems-secret',
    'Secret utløper',
    'Secret tilbakekalt',
    'Slettet',
  ]) {
    assert.equal(headers[excludedHeader], undefined);
  }
  assert.equal(headers['Personlig undersøkelseslenke'], undefined);
});

test('non-numeric H-numbers remain text in the workbook', async () => {
  const member = {
    id: '9007199254740992',
    h_number: 'H-25',
    access_token: '11111111111111111111111111111111',
    other_contact_emails: [],
    has_responded: false,
  };
  const survey = { id: '22222222222222222222222222222222', title: 'Test' };
  const buffer = await buildMemberWorkbook({ members: [member], survey, baseUrl: 'https://example.no' });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const row = workbook.getWorksheet('Medlemmer').getRow(2);
  assert.equal(row.getCell(1).value, member.h_number);
});

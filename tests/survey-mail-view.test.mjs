import test from 'node:test';
import assert from 'node:assert/strict';
import { mailRows, selectMailRows } from '../lib/survey-mail-view.js';
import surveys from '../locales/nb/surveys.js';
const t = (key, _values, fallback) => key.split('.').reduce((value, part) => value?.[part], surveys.email) || fallback || key;
const rows = mailRows([
  ...Array.from({ length: 60 }, (_, i) => ({ id: `invitation:${i}`, member_id: i, h_number: `H${i}`, kind: 'invitation', status: 'sent', accepted: true })),
  { id: 'receipt:60', member_id: 60, h_number: 'H60', kind: 'receipt', status: 'failed', failure_reason: 'UPSTREAM', diagnostic: { error_id: 'error-tail', http_status: 422, provider_message: 'Sender not verified', provider_code: 'MS42201' } },
  { id: 'receipt:61', member_id: 61, h_number: 'H61', kind: 'receipt', status: 'suppressed', failure_reason: 'ADMIN_IMPORT_NO_RECEIPT' },
  { id: 'invitation:duplicate', member_id: 0, h_number: 'H0', kind: 'invitation', status: 'sent', accepted: true },
], t);

test('filters operate on the full set including rows not rendered yet', () => {
  assert.equal(selectMailRows(rows, { type: 'receipt', status: 'failed', note: 'MS42201' })[0].id, 'receipt:60');
  assert.equal(selectMailRows(rows, { note: 'ERROR-TAIL' }).length, 1);
  assert.equal(selectMailRows(rows, { tile: 'suppressed', note: 'etter avtale' }).length, 1);
  assert.equal(selectMailRows(rows, { status: 'sent', note: 'etter avtale' }).length, 0);
  assert.equal(selectMailRows(rows, { tile: 'invitations' }).length, 61);
  assert.equal(selectMailRows(rows, { tile: 'properties' }).length, 60);
});

test('all six columns sort both ways before display slicing, with natural property-number order', () => {
  for (const key of ['member', 'address', 'type', 'recipient', 'status', 'note']) {
    const ascending = selectMailRows(rows, { sort: { key, direction: 'asc' } });
    const descending = selectMailRows(rows, { sort: { key, direction: 'desc' } });
    const collator = new Intl.Collator('nb', { numeric: true, sensitivity: 'base' });
    assert.ok(ascending.every((row, i) => !i || collator.compare(ascending[i - 1].cells[key], row.cells[key]) <= 0));
    assert.ok(descending.every((row, i) => !i || collator.compare(descending[i - 1].cells[key], row.cells[key]) >= 0));
  }
  assert.equal(selectMailRows(rows, { sort: { key: 'member', direction: 'desc' } })[0].cells.member, 'H61');
  assert.equal(rows[0].cells.member, 'H0');
});

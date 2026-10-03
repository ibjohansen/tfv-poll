import test from 'node:test';
import assert from 'node:assert/strict';
import { MatrikkelClient, chooseAddressCandidate, parseMatrikkelXml, parseOwners } from '../lib/matrikkel-client.js';

test('SOAP client sends the quoted SOAPAction required by Matrikkel', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const value = requests.length === 1 ? '<return><value>123</value></return>' : '<return>true</return>';
    return new Response(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${value}</soap:Body></soap:Envelope>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  };

  try {
    const client = new MatrikkelClient({
      API_MATRIKKEL_BASE_URL: 'https://matrikkel.no/matrikkelapi/wsapi/v1',
      API_MATRIKKEL_USR: 'test-user',
      API_MATRIKKEL_PWD: 'test-password',
    });
    assert.equal(await client.verifyAccess(), '123');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers.SOAPAction, '""');
  assert.equal(requests[0].options.headers.Authorization, 'Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ=');
});

test('SOAP errors expose a stable code and HTTP status, never provider response text', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('secret provider detail', { status: 401 });
  try {
    const client = new MatrikkelClient({
      API_MATRIKKEL_BASE_URL: 'https://matrikkel.no/matrikkelapi/wsapi/v1',
      API_MATRIKKEL_USR: 'test-user',
      API_MATRIKKEL_PWD: 'test-password',
    });
    await assert.rejects(
      client.verifyAccess(),
      { code: 'UNAUTHORIZED', messageCode: 'MATRIKKEL_HTTP', messageParams: { httpStatus: 401 } },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('escaped dollar signs in local env passwords are sent literally', () => {
  const client = new MatrikkelClient({
    API_MATRIKKEL_BASE_URL: 'https://matrikkel.no/matrikkelapi/wsapi/v1',
    API_MATRIKKEL_USR: 'user',
    API_MATRIKKEL_PWD: 'before\\$after',
  });
  assert.equal(client.authorization, `Basic ${Buffer.from('user:before$after').toString('base64')}`);
});

test('address matching accepts one exact property and rejects ambiguity', () => {
  const exact = { adressetekst: 'Turufjellvegen 382', kommunenummer: '3320', gardsnummer: 10, bruksnummer: 371 };
  assert.equal(chooseAddressCandidate([exact], 'Turufjellvegen 382').matchType, 'EXACT');
  assert.throws(() => chooseAddressCandidate([exact, { ...exact, bruksnummer: 372 }], 'Turufjellvegen 382'), { code: 'AMBIGUOUS_ADDRESS' });
  assert.equal(chooseAddressCandidate([exact, { ...exact, bruksnummer: 372 }], 'Turufjellvegen 382', { gnr: '10', bnr: '372' }).matchType, 'EXACT_PROPERTY');
  assert.throws(() => chooseAddressCandidate([exact], 'Turufjellvegen 382', { gnr: '10', bnr: '999' }), { code: 'PROPERTY_MISMATCH' });
  assert.throws(() => chooseAddressCandidate([{ ...exact, kommunenummer: '0301' }], 'Turufjellvegen 382'), { code: 'ADDRESS_NOT_FOUND' });
});

test('SOAP parser retains active registered owners and their individual dates', () => {
  const root = parseMatrikkelXml(`<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soap:Body><return><item xsi:type="FysiskPerson"><id><value>7</value></id><fornavn>OLA</fornavn><etternavn>NORDMANN</etternavn></item><item xsi:type="TinglystEierforhold"><eierId><value>7</value></eierId><andel><teller>1</teller><nevner>2</nevner></andel><datoFra><date>2024-01-12</date></datoFra></item><item xsi:type="IkkeTinglystEierforhold"><eierId><value>7</value></eierId></item></return></soap:Body></soap:Envelope>`);
  assert.deepEqual(parseOwners(root, '123'), { matrikkelId: '123', owners: [{ name: 'OLA NORDMANN', dateFrom: '2024-01-12', share: '1/2' }] });
});

test('SOAP parser blocks document types', () => {
  assert.throws(() => parseMatrikkelXml('<!DOCTYPE foo><foo/>'), { code: 'INVALID_XML', messageCode: 'MATRIKKEL_XML_BLOCKED' });
});

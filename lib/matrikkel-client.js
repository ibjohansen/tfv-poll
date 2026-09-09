import { XMLParser } from 'fast-xml-parser';

const SOAP_NAMESPACE = 'http://schemas.xmlsoap.org/soap/envelope/';
const BRUKER_NAMESPACE = 'http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/service/bruker';
const MATRIKKELENHET_SERVICE_NAMESPACE = 'http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/service/matrikkelenhet';
const DOMAIN_NAMESPACE = 'http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain';
const MATRIKKELENHET_DOMAIN_NAMESPACE = 'http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/matrikkelenhet';
const KOMMUNE_DOMAIN_NAMESPACE = 'http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/kommune';
const KOMMUNENUMMER = '3320';
const POSTNUMMER = '3539';
const ADDRESS_API_URL = 'https://ws.geonorge.no/adresser/v1/sok';
const A5_URL = 'https://www.kartverket.no/metadata/Avvikslister/3320_A5-adressepunktIFeilMatrikkelenhet.html';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
});

export class MatrikkelError extends Error {
  constructor(message, code = 'MATRIKKEL_ERROR') {
    super(message);
    this.name = 'MatrikkelError';
    this.code = code;
  }
}

function xmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function matrikkelContext(prefix) {
  return `<${prefix}:matrikkelContext><dom:locale>no_NO</dom:locale><dom:brukOriginaleKoordinater>true</dom:brukOriginaleKoordinater><dom:koordinatsystemKodeId><dom:value>22</dom:value></dom:koordinatsystemKodeId><dom:systemVersion>trunk</dom:systemVersion><dom:klientIdentifikasjon>TurufjellVelMedlemsservice</dom:klientIdentifikasjon></${prefix}:matrikkelContext>`;
}

function envelope(body) {
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${SOAP_NAMESPACE}" xmlns:bru="${BRUKER_NAMESPACE}" xmlns:mat="${MATRIKKELENHET_SERVICE_NAMESPACE}" xmlns:dom="${DOMAIN_NAMESPACE}" xmlns:men="${MATRIKKELENHET_DOMAIN_NAMESPACE}" xmlns:kom="${KOMMUNE_DOMAIN_NAMESPACE}"><soapenv:Header/><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;
}

function visit(value, callback) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((item) => visit(item, callback)); return; }
  for (const [key, child] of Object.entries(value)) {
    callback(key, child);
    visit(child, callback);
  }
}

function scalar(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value).trim();
  if (Array.isArray(value)) return value.map(scalar).find(Boolean) || '';
  if (typeof value['#text'] !== 'undefined') return scalar(value['#text']);
  return Object.entries(value).filter(([key]) => !key.startsWith('@_')).map(([, child]) => scalar(child)).find(Boolean) || '';
}

function firstNamed(root, name) {
  let result;
  visit(root, (key, value) => { if (result === undefined && key === name) result = value; });
  return result;
}

function childText(node, ...path) {
  let current = node;
  for (const name of path) {
    if (!current || typeof current !== 'object') return '';
    current = Array.isArray(current[name]) ? current[name][0] : current[name];
  }
  return scalar(current);
}

function allNamed(root, name) {
  const result = [];
  visit(root, (key, value) => {
    if (key === name) result.push(...(Array.isArray(value) ? value : [value]));
  });
  return result.filter((value) => value && typeof value === 'object');
}

export function parseMatrikkelXml(raw) {
  if (/<!DOCTYPE/i.test(raw)) throw new MatrikkelError('SOAP-respons inneholdt en blokkert dokumenttype.', 'INVALID_XML');
  let root;
  try { root = parser.parse(raw); } catch { throw new MatrikkelError('Matrikkel-API returnerte ugyldig XML.', 'INVALID_XML'); }
  const fault = firstNamed(root, 'Fault');
  if (fault) throw new MatrikkelError(`SOAP-feil: ${childText(fault, 'faultstring') || 'ukjent feil'}`, 'SOAP_FAULT');
  return root;
}

function validateBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new MatrikkelError('API_MATRIKKEL_BASE_URL er ugyldig.', 'CONFIGURATION'); }
  if (url.protocol !== 'https:' || !(url.hostname === 'matrikkel.no' || url.hostname.endsWith('.matrikkel.no'))) {
    throw new MatrikkelError('API_MATRIKKEL_BASE_URL må være et HTTPS-endepunkt hos matrikkel.no.', 'CONFIGURATION');
  }
  if (url.hostname.includes('prodtest') && process.env.MATRIKKEL_ALLOW_PRODTEST !== 'true') {
    throw new MatrikkelError('Prodtest er ikke tillatt uten MATRIKKEL_ALLOW_PRODTEST=true.', 'CONFIGURATION');
  }
  return url.toString().replace(/\/$/, '');
}

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(180_000) });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new MatrikkelError(`Ekstern tjeneste svarte med HTTP ${response.status}.`, 'UPSTREAM');
    } catch (error) { lastError = error; }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
  }
  throw lastError;
}

export class MatrikkelClient {
  constructor(env = process.env) {
    if (!env.API_MATRIKKEL_BASE_URL || !env.API_MATRIKKEL_USR || !env.API_MATRIKKEL_PWD) throw new MatrikkelError('Matrikkel-API er ikke konfigurert.', 'CONFIGURATION');
    this.baseUrl = validateBaseUrl(env.API_MATRIKKEL_BASE_URL);
    // Next.js krever at dollar i lokale .env-filer skrives som \$. Node sin
    // innebygde --env-file-behandling beholder derimot escape-tegnet.
    const password = env.API_MATRIKKEL_PWD.replaceAll('\\$', '$');
    this.authorization = `Basic ${Buffer.from(`${env.API_MATRIKKEL_USR}:${password}`).toString('base64')}`;
  }

  async soap(service, body) {
    const operation = body.match(/<[A-Za-z_][\w.-]*:([A-Za-z_][\w.-]*)/)?.[1] || 'ukjentOperasjon';
    const response = await fetchWithRetry(`${this.baseUrl}/${service}`, {
      method: 'POST', cache: 'no-store', redirect: 'error',
      headers: { Authorization: this.authorization, 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""', 'User-Agent': 'TurufjellVel-Medlemsservice/1.0' },
      body: envelope(body),
    });
    const raw = await response.text();
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try { message = childText(firstNamed(parseMatrikkelXml(raw), 'Fault'), 'faultstring') || message; } catch { /* Bruk trygg statusmelding. */ }
      throw new MatrikkelError(`Matrikkel-API avviste ${service}/${operation}: ${message}`, response.status === 401 ? 'UNAUTHORIZED' : 'UPSTREAM');
    }
    return parseMatrikkelXml(raw);
  }

  async verifyAccess() {
    const root = await this.soap('BrukerServiceWS', `<bru:getPaloggetBruker>${matrikkelContext('bru')}</bru:getPaloggetBruker>`);
    const userId = scalar(firstNamed(root, 'return'));
    if (!userId) throw new MatrikkelError('Fant ikke ID for pålogget Matrikkel-bruker.', 'UNAUTHORIZED');
    const rightsRoot = await this.soap('BrukerServiceWS', `<bru:harLesEierforholdRettighet><bru:brukerId><dom:value>${xmlEscape(userId)}</dom:value></bru:brukerId>${matrikkelContext('bru')}</bru:harLesEierforholdRettighet>`);
    if (scalar(firstNamed(rightsRoot, 'return')).toLowerCase() !== 'true') throw new MatrikkelError('API-brukeren mangler rettighet til å lese eierforhold.', 'UNAUTHORIZED');
    return userId;
  }

  async lookupProperty({ gnr, bnr, fnr = '0', snr = '0' }) {
    const idRoot = await this.soap('MatrikkelenhetServiceWS', `<mat:findMatrikkelenhetIdForIdent><mat:matrikkelenhetIdent><men:kommuneIdent><kom:kommunenummer>${KOMMUNENUMMER}</kom:kommunenummer></men:kommuneIdent><men:gardsnummer>${xmlEscape(gnr)}</men:gardsnummer><men:bruksnummer>${xmlEscape(bnr)}</men:bruksnummer><men:festenummer>${xmlEscape(fnr)}</men:festenummer><men:seksjonsnummer>${xmlEscape(snr)}</men:seksjonsnummer></mat:matrikkelenhetIdent>${matrikkelContext('mat')}</mat:findMatrikkelenhetIdForIdent>`);
    const matrikkelId = scalar(firstNamed(idRoot, 'return'));
    if (!matrikkelId) throw new MatrikkelError(`Fant ikke matrikkelenhet for ${gnr}/${bnr}.`, 'NOT_FOUND');
    const root = await this.soap('MatrikkelenhetServiceWS', `<mat:findObjekterForMatrikkelenhet><mat:matrikkelenhetId><dom:value>${xmlEscape(matrikkelId)}</dom:value></mat:matrikkelenhetId>${matrikkelContext('mat')}</mat:findObjekterForMatrikkelenhet>`);
    return parseOwners(root, matrikkelId);
  }
}

export function parseOwners(root, matrikkelId = '') {
  const people = new Map();
  for (const item of allNamed(root, 'item')) {
    const type = String(item['@_type'] || '').split(':').at(-1);
    if (!['Person', 'FysiskPerson', 'JuridiskPerson', 'UtenlandskPerson'].includes(type)) continue;
    const id = childText(item, 'id', 'value');
    if (!id) continue;
    const personalName = [childText(item, 'fornavn'), childText(item, 'mellomnavn'), childText(item, 'etternavn')].filter(Boolean).join(' ');
    const legalName = childText(item, 'organisasjonsnavn') || childText(item, 'juridiskPersonNavn') || childText(item, 'navn');
    people.set(id, { name: personalName || legalName, type });
  }
  const owners = [];
  const seen = new Set();
  for (const item of allNamed(root, 'item')) {
    const type = String(item['@_type'] || '').split(':').at(-1);
    if (!type.endsWith('Eierforhold') || type.includes('IkkeTinglyst') || childText(item, 'datoTil', 'date')) continue;
    const ownerId = childText(item, 'eierId', 'value');
    const person = people.get(ownerId);
    if (!person?.name) continue;
    const owner = { name: person.name, dateFrom: childText(item, 'datoFra', 'date'), share: [childText(item, 'andel', 'teller'), childText(item, 'andel', 'nevner')].filter(Boolean).join('/') };
    const key = JSON.stringify(owner);
    if (!seen.has(key)) { seen.add(key); owners.push(owner); }
  }
  return { matrikkelId, owners };
}

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('nb-NO').replace(/\s+/g, ' ').replace(/(?<=\D)(?=\d+[a-zæøå]?$)/i, ' ').trim();
}

function cleanNumber(value) {
  const match = String(value || '').match(/\d+/);
  return match && match[0] !== '0' ? match[0] : '0';
}

function propertyKey(item) {
  return { gnr: cleanNumber(item.gardsnummer), bnr: cleanNumber(item.bruksnummer), fnr: cleanNumber(item.festenummer), snr: cleanNumber(item.seksjonsnummer) };
}

function resultAddress(item) {
  return String(item.adressetekst || item.adressetekstutenadressetilleggsnavn || '').trim();
}

function similarity(left, right) {
  if (left === right) return 1;
  const rows = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = rows[0]; rows[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const previous = rows[j];
      rows[j] = Math.min(rows[j] + 1, rows[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = previous;
    }
  }
  return 1 - rows[right.length] / Math.max(left.length, right.length, 1);
}

export function chooseAddressCandidate(items, address) {
  const target = normalizeText(address);
  const valid = items.filter((item) => ['', KOMMUNENUMMER].includes(String(item.kommunenummer || '').trim()));
  const exact = valid.filter((item) => normalizeText(resultAddress(item)) === target);
  const distinct = new Map(exact.map((item) => [JSON.stringify([resultAddress(item), propertyKey(item)]), item]));
  if (distinct.size === 1) return { candidate: [...distinct.values()][0], matchType: 'EXACT', score: 1 };
  if (distinct.size > 1) throw new MatrikkelError('Adressen har flere forskjellige eksakte treff.', 'AMBIGUOUS_ADDRESS');
  const scored = valid.map((item) => ({ item, score: similarity(target, normalizeText(resultAddress(item))) })).sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < 0.9 || scored[0].score - (scored[1]?.score || 0) < 0.04) throw new MatrikkelError('Ingen entydig adresse funnet.', 'ADDRESS_NOT_FOUND');
  return { candidate: scored[0].item, matchType: 'FUZZY', score: scored[0].score };
}

async function addressRequest(query) {
  const url = new URL(ADDRESS_API_URL);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetchWithRetry(url, { cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new MatrikkelError(`Adresse-API svarte med HTTP ${response.status}.`, 'UPSTREAM');
  const data = await response.json();
  if (!Array.isArray(data.adresser)) throw new MatrikkelError('Adresse-API returnerte ugyldige data.', 'UPSTREAM');
  return data.adresser;
}

export async function lookupAddress(address) {
  const value = String(address || '').trim();
  if (!/[A-Za-zÆØÅæøå]/.test(value) || !/\d/.test(value)) throw new MatrikkelError('Adressen mangler vegnavn eller husnummer.', 'INVALID_ADDRESS');
  const fixed = { kommunenummer: KOMMUNENUMMER, postnummer: POSTNUMMER, treffPerSide: '100' };
  const exactItems = await addressRequest({ ...fixed, adressetekst: value });
  try { return chooseAddressCandidate(exactItems, value); } catch (error) { if (error.code === 'AMBIGUOUS_ADDRESS') throw error; }
  const fuzzyItems = await addressRequest({ ...fixed, sok: value, fuzzy: 'true' });
  return chooseAddressCandidate(fuzzyItems, value);
}

function decodeHtml(value) {
  return value.replace(/<[^>]*>/g, ' ').replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').replaceAll('&aring;', 'å').replaceAll('&oslash;', 'ø').replaceAll('&aelig;', 'æ').replace(/\s+/g, ' ').trim();
}

function canonical(value) {
  return normalizeText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replaceAll('ø', 'o').replaceAll('æ', 'ae').replaceAll('å', 'a').replace(/[^a-z0-9]+/g, '');
}

export async function loadA5Entries() {
  const response = await fetchWithRetry(A5_URL, { cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new MatrikkelError(`A5-listen svarte med HTTP ${response.status}.`, 'UPSTREAM');
  const html = await response.text();
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => decodeHtml(cell[1]))).filter((row) => row.length);
  const headerIndex = rows.findIndex((row) => { const values = new Set(row.map(canonical)); return values.has('adresse') && values.has('gardsnummer') && values.has('bruksnummer'); });
  if (headerIndex < 0) throw new MatrikkelError('Fant ikke forventet tabell i A5-listen.', 'A5_FORMAT');
  const headers = rows[headerIndex].map(canonical);
  const index = (...names) => headers.findIndex((header) => names.includes(header));
  const at = (row, position) => position < 0 ? '' : row[position] || '';
  const result = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const address = at(row, index('adresse'));
    if (!address) continue;
    const entry = {
      address,
      underlying: { gnr: cleanNumber(at(row, index('gardsnummer'))), bnr: cleanNumber(at(row, index('bruksnummer'))), fnr: cleanNumber(at(row, index('festenummer'))), snr: '0' },
      referenced: { gnr: cleanNumber(at(row, index('adressegardsnr', 'adressegardsnummer'))), bnr: cleanNumber(at(row, index('adressebruksnr', 'adressebruksnummer'))), fnr: cleanNumber(at(row, index('adressefestenr', 'adressefestenummer'))), snr: '0' },
    };
    const key = normalizeText(address);
    result.set(key, [...(result.get(key) || []), entry]);
  }
  return result;
}

export function findA5Entry(entries, originalAddress, officialAddress) {
  const candidates = [...new Set([normalizeText(originalAddress), normalizeText(officialAddress)])].flatMap((key) => entries.get(key) || []);
  const unique = new Map(candidates.map((entry) => [JSON.stringify(entry.underlying), entry]));
  if (unique.size > 1) throw new MatrikkelError('A5-listen har flere underliggende matrikkelenheter for adressen.', 'AMBIGUOUS_A5');
  return [...unique.values()][0] || null;
}

export function addressProperty(item) { return propertyKey(item); }
export function officialAddress(item) { return resultAddress(item); }

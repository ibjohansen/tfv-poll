# Ekstern sikkerhetsgjennomgang 20.09.2026

**Objekt:** tfv-poll (Turufjell Vel medlemsservice)

- Gjennomført: 20. september 2026, statisk kodegjennomgang av `tfv-poll-main.zip`
  (575 filer, ca. 28 000 linjer JS/JSX)
- Språk i rapporten: norsk. Filreferanser er `fil:linje` i ZIP-en du lastet opp.
- Alvorlighet: **Middels** = bør tettes i nærmeste utviklingsrunde, **Lav** = herding og
  god praksis, **Info** = til orientering. Jeg fant **ingen kritiske eller høye
  sårbarheter** i det jeg kunne verifisere (ingen SQL-injeksjon, ingen
  autentiseringsbypass, ingen hemmeligheter i koden). Funnene under er
  svakheter som er verdt å lukke, ikke akutte brudd.

---

## 1. Metode og hva som ikke er verifisert

**Gjennomgått i detalj:** `auth.js`, `proxy.js`, `next.config.mjs`, `netlify.toml`,
all adminpolicy/RBAC, alle 51 API-ruter (offentlige og admin) med kartlegging av
hvilken autorisasjon hver enkelt faktisk får, hele medlems- og survey-tokenflyten,
rate limiting, filopplasting og fillagring, e-posttjeneste og webhook,
bakgrunnsjobber, Matrikkel-klienten, sikkerhetsdelene av `database/schema.sql`,
CI-oppsett, `.env.example`, dokumentasjon og bildefiler.

**Skummet, ikke linje for linje:** React-komponenter (UI), i18n, kartleverandørene
(Kartverket/OSM), importskriptene og testene.

**Kunne ikke verifiseres fra en ZIP uten nettverk:**

| Område | Hvorfor det mangler | Slik sjekker du selv |
|---|---|---|
| Kjente sårbarheter i avhengigheter | Ingen nettverkstilgang, så `npm audit` kunne ikke kjøres | `npm audit --omit=dev` og `osv-scanner --lockfile package-lock.json` |
| Git-historikk | ZIP fra GitHub inneholder ikke `.git` | `gitleaks detect` og `trufflehog git file://.` i en full klone |
| Faktiske produksjonsheadere og aktiv Netlify-rate-limit | Kun kildekode | `curl -sI https://medlemsservice.turufjellvel.no/` og deploy-loggen |
| Entra-oppsett (MFA, Assignment required, gjester) | Ligger utenfor repoet | Se sjekklisten i kapittel 6 |
| Neon-roller, IP-begrensning, bucket-tilgang | Ligger utenfor repoet | Se sjekklisten i kapittel 6 |
| Kjøring av testene | Ingen `node_modules` | `npm ci && npm run check` lokalt |
| Dynamisk testing | Ingen kjørende applikasjon | Kapittel 7 foreslår en avgrenset test i staging |

---

## 2. Samlet vurdering

Applikasjonen er bedre sikret enn de fleste prosjekter i tilsvarende størrelse.
Tokenflytene, nonce-basert CSP, fail-closed adminpolicy og miljøbinding av tokens er
gjennomtenkt og har tester. Det som gjenstår er i hovedsak:

1. **Admin-kontoen er den store enkeltrisikoen.** Identiteten bygger på et
   e-postclaim, rollehåndhevelsen er valgfri, og en stjålet admin-økt kan eksportere
   hele medlemsregisteret uten ekstra bekreftelse (F-01, F-02).
2. **Flere offentlige flater er mer generøse enn de trenger å være**, blant annet
   det åpne kartendepunktet som lister hele medlemsregisteret per grend (F-06), og
   et rate-limit-oppsett som kan brukes til å låse ute medlemmer (F-07).
3. **Repoet er offentlig og lekker mer enn nødvendig**: GPS-koordinater i bilder,
   Neon-gren- og snapshot-ID-er, navngitte admin-adresser (F-14), og CI/leverandørkjeden
   har ingen automatisk kontroll (F-15).
4. **Databasen har én rolle med alle rettigheter og ingen oppbevaringsregler**, noe
   som både øker skadeomfanget ved en feil og kolliderer med sletterett (F-12).

Anbefalt rekkefølge står i kapittel 7.

---

## 3. Det som allerede er solid (behold og dekk med regresjonstester)

- **Tokendesign:** 256-bits tilfeldige hemmeligheter, bare SHA-256-hash lagres, tokens
  er bundet til miljø, audience og formål, og innløses atomisk i én SQL-setning
  (`lib/member-self-service.js:192-227`). Sesjonscookie er `__Host-`, `HttpOnly`,
  `Secure`, `SameSite=Lax`.
- **Admin feiler lukket:** manglende tenant, allowlist eller rolleoppsett gir avslag
  (`lib/admin-policy.js`). Alle eksporterte admin-funksjoner i `lib/` kaller
  `requirePermission`, så datalaget er ikke avhengig av at proxyen fungerer.
- **SQL:** Alle spørringer er parametriserte. De få dynamiske delene (`ORDER BY`,
  tabellnavn) går gjennom hvitlister (`lib/admin-members.js:7-12`,
  `lib/admin-surveys.js:12`). Ingen `dangerouslySetInnerHTML` noe sted.
- **Rik tekst:** Tiptap-JSON valideres mot en streng hvitliste, og lenker må være
  `https`, `http`, `mailto`, relative eller anker (`lib/rich-text.js`).
- **CSP:** nonce per forespørsel, `strict-dynamic`, ingen `unsafe-inline` i `script-src`,
  `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'` (`proxy.js:19-23`).
- **Opplisting av medlemmer stoppes:** identisk offentlig svar og `after()` slik at
  e-postsending ikke gir timingforskjell på `/api/member-access/request`.
- **Webhook:** HMAC-signatur med `timingSafeEqual`, dedupe på `provider_event_id`.
  Den hardkodede test-hemmeligheten i `lib/mailersend-webhook.js:4` er MailerSends
  dokumenterte testverdi og gir bare en `204` uten bivirkninger.
- **Matrikkel-klient:** base-URL låst til HTTPS på matrikkel.no, `redirect: 'error'`,
  all XML-interpolering går gjennom `xmlEscape`.
- **Mock-modus** kan ikke aktiveres i produksjon (`lib/mock-store.js:7`).
- **Audit:** append-only-triggere på `audit_log` og `security_events`, og
  hemmelighetsfelt fjernes fra revisjonsradene.

---

## 4. Funnoversikt

| ID | Alvor | Tittel | Hovedsted |
|---|---|---|---|
| F-01 | Middels | Admin-identitet bygger på e-postclaim, og roller er valgfrie | `auth.js:12,19`, `lib/admin-policy.js:34,41` |
| F-02 | Middels | Stor skadeomfang ved stjålet admin-økt (ingen step-up, ingen tilbakekalling) | `auth.js:16`, `app/api/admin/members/export/route.js` |
| F-03 | Middels | Ingen sentral CSRF/origin-kontroll på admin-mutasjoner, seks ulike varianter | `app/api/admin/**`, `lib/request-origin.js:13` |
| F-04 | Middels | Jobbhemmeligheter sendes til en origin utledet fra requesten | `lib/request-origin.js:1-4`, `app/survey/api/responses/route.js:67` |
| F-05 | Middels | Innloggingslenken forbrukes av GET og ligger i query-strengen | `app/api/member-access/verify/route.js:8` |
| F-06 | Middels | Åpent API lister hele medlemsregisteret per grend, med H-nummer | `lib/map/public-map-service.js:89-127` |
| F-07 | Middels | Rate limiting kan brukes til å låse ute medlemmer; IPv6- og minneproblemer | `lib/shared-rate-limit.js:35-40`, `lib/rate-limit.js` |
| F-08 | Lav | Timingorakel på innmeldingsskjemaet | `lib/member-self-service.js:580-631` |
| F-09 | Lav | MailerSend-suppressionlisten hentes live i offentlige flyter | `lib/mailer-service.js:171-206` |
| F-10 | Middels | Filopplasting: makroformater, ingen virusskanning, EXIF beholdes | `lib/upload-validation.js:12-26`, `lib/cms-files.js` |
| F-11 | Lav | Preview-token: 24 t, ikke tilbakekallbar, delt nøkkel | `lib/survey-preview.js:8` |
| F-12 | Middels | Én databaserolle, ingen RLS, ingen oppbevaring, sletterett | `database/schema.sql` |
| F-13 | Lav | Eierskifte og kontaktendringer varsles ikke til gammel e-post | `lib/member-self-service.js:780-840` |
| F-14 | Middels | Offentlig repo lekker GPS, gren-/snapshot-ID-er og admin-adresser | `original_images/`, `docs/`, `tests/admin-policy.test.mjs:5` |
| F-15 | Middels | CI og leverandørkjede: uklare actions-versjoner, ingen automatisk skanning | `.github/workflows/ci.yml` |
| F-16 | Lav | Nettleserherding: headere, iframe uten sandbox, security.txt | `next.config.mjs`, `proxy.js`, `components/MemberPropertyMap.js:25` |
| F-17 | Lav | Bruksstatistikk-endepunktet har ingen rate limit | `app/api/usage/pageview/route.js` |
| F-18 | Lav | Personvern: co-mottakeradresser i e-post, revisjonslogg med svar, tredjeparts-oppslag | `lib/email-templates.js:44` |
| F-19 | Lav | Ingen validering av hemmelighetsstyrke | `lib/admin-policy.js:56-60`, `netlify/functions/*` |

---

## 5. Detaljerte funn og tiltak

### F-01 – Admin-identitet bygger på e-postclaim, og roller er valgfrie (Middels)

**Bevis**
- `auth.js:12,19-22`: identiteten er `profile.email || profile.preferred_username`.
- `lib/admin-policy.js:34`: er `ADMIN_REQUIRED_ROLES` tom, returnerer `isAllowedAdmin`
  `true` for alle på allowlisten. `:41` gir da **alle** rettigheter (members, surveys,
  cms, matrikkel, audit). RBAC-koden er altså sovende inntil variabelen settes.
- `lib/admin-policy.js:56-60`: `AUTH_SECRET` sjekkes bare for at den finnes.

**Risiko:** `email`-claimet i Entra er ikke en uforanderlig identifikator og er ikke
garantert verifisert (kjent som «nOAuth»-klassen). `tid`-sjekken stopper andre
tenanter, men ikke gjestekontoer eller en endret `mail`-attributt i din egen tenant.

**Tiltak**
1. Bind allowlisten til `oid` (objekt-ID), ikke e-post:
   ```js
   // auth.js – profile() og jwt()
   return { id: profile.sub, oid: profile.oid, email: profile.email || profile.preferred_username, roles: profile.roles || [] };
   token.oid = profile.oid;

   // lib/admin-policy.js
   const oids = (env.ADMIN_OBJECT_IDS || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
   if (!oids.length || !oids.includes(String(identity.oid || '').toLowerCase())) return false;
   ```
   Behold e-post som ekstra kontroll, ikke som eneste.
2. Gjør roller **obligatoriske i produksjon**: `isAuthConfigured` skal returnere `false`
   når `APP_ENVIRONMENT=production` og `ADMIN_REQUIRED_ROLES` er tom.
3. Krev `AUTH_SECRET` på minst 32 tegn (se F-19).
4. I Entra: *Assignment required = Yes* på Enterprise Application, tildel `TFV.*`-roller
   via sikkerhetsgrupper, blokker gjester, krev MFA og Conditional Access, og bruk PIM
   for de som trenger `TFV.SecurityAudit` og `TFV.MatrikkelAdmin`.

**Test:** enhetstest som viser at en identitet med riktig e-post men feil/manglende `oid`
avvises, og at produksjonskonfig uten roller gir `isAuthConfigured() === false`.

---

### F-02 – Stort skadeomfang ved stjålet admin-økt (Middels)

**Bevis:** `auth.js:16` – stateless JWT, 8 timer, ingen tilbakekalling på serveren.
`app/api/admin/members/export/route.js` eksporterer hele registeret (navn, e-post,
adresser) med ett kall. Eksporten logges (`recordAdminExport`), men varsler ikke noen.
Masseutsending og sletting krever heller ingen ny bekreftelse.

**Tiltak**
1. **Step-up** for eksport, masseutsending, sletting og endring av grender: krev
   `auth_time` yngre enn 15 min og `amr` som inneholder `mfa`, ellers send brukeren
   gjennom ny innlogging (`prompt=login`).
2. Kort ned `maxAge` til 2–4 timer, eller flytt til databasesesjoner som kan
   tilbakekalles (lagre kun hash, som for medlemssesjoner).
3. **Varsle** to administratorer på e-post når en eksport/utsending overstiger en terskel
   (for eksempel over 200 rader) eller skjer utenfor normal tid. `security_events`
   finnes allerede, så det holder å legge på en hendelsestype og en liten jobb.
4. Vurder toparts-godkjenning for «eksporter alle».

---

### F-03 – Ingen sentral CSRF/origin-kontroll på admin-mutasjoner (Middels)

**Bevis:** Admin-rutene under `app/api/admin/` (unntatt matrikkel, survey-e-post,
kart og eksport) har ingen origin-kontroll. Det finnes seks ulike varianter av
`sameOrigin` (`request/route.js:11`, `profile/route.js:11`, `membership-requests/route.js:12`,
`admin/members/export/route.js:7`, `member-requests/[id]/route.js:8`, `lib/map/api.js:15`)
pluss `lib/request-origin.js:13`. Flere godtar manglende `Origin`, og noen sammenligner
mot `request.nextUrl.origin` (utledet fra Host) i stedet for `AUTH_URL`.
`readJsonObject` (`lib/api-errors.js:14`) krever ikke `Content-Type: application/json`.

Beskyttelsen i dag er i praksis bare `SameSite=Lax` på Auth.js-cookien. Det stopper
kryss-nettsted, men ikke angrep fra et søsken-subdomene under `turufjellvel.no`.
`handleMapRequest` (`lib/map/api.js`) viser riktig mønster: origin, JSON-krav og
begrenset body. De andre rutene bør gjøre det samme.

**Tiltak:** ett felles vern i `proxy.js`, og fjern de lokale variantene.
```js
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function crossSiteMutation(request) {
  const { pathname } = request.nextUrl;
  if (!MUTATING.has(request.method) || pathname.startsWith('/api/auth/') || pathname === '/api/webhooks/mailersend') return false;
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) return true;
  const origin = request.headers.get('origin');
  if (origin) return origin !== new URL(process.env.AUTH_URL).origin;
  return pathname.startsWith('/api/admin/');   // admin krever Origin eller Sec-Fetch-Site
}
```
Krev i tillegg `Content-Type: application/json` i `readJsonObject`.
**Test:** POST mot hver admin-rute med `Origin: https://evil.example` og med
`Sec-Fetch-Site: same-site` skal gi 403.

---

### F-04 – Jobbhemmeligheter sendes til en origin utledet fra requesten (Middels, konfigurasjonsavhengig)

**Bevis**
- `lib/request-origin.js:1-4`: bruker `AUTH_URL`, men faller tilbake til `request.url`.
- `app/survey/api/responses/route.js:66-71` (offentlig rute): `dispatchSurveyReceipts(origin)`
  sender `X-MailerSend-Job-Secret` til den originen.
- `app/api/admin/map/hamlets/route.js:20`: `dispatchHamletMemberSync(trigger, request.nextUrl.origin)`.
- Alle `dispatch*`-funksjonene (`lib/survey-email-background.js:38-56`,
  `lib/matrikkel-background.js:15-18`, `lib/map/hamlet-sync-background.js:15-19`) sjekker
  bare `https:` og at URL-en ikke har brukernavn. Ingen vertsnavn-hviteliste.
- `MAILERSEND_JOB_SECRET` deles av nyhetsbrev, survey-e-post og kvitteringer.

Er `AUTH_URL` satt i produksjon (du har den i `SECRETS_SCAN_OMIT_KEYS`, så trolig ja),
er dette lukket i dag. Men sikkerheten hviler på én miljøvariabel, og en feilkonfigurering
ville sende hemmeligheten til en angriperstyrt vert.

**Tiltak**
```js
// lib/trusted-origin.js
const HOSTS = new Set(['medlemsservice.turufjellvel.no']);
export function trustedOrigin(env = process.env) {
  const url = new URL(env.AUTH_URL || (env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'));
  if (env.NODE_ENV === 'production' && (url.protocol !== 'https:' || !HOSTS.has(url.hostname))) throw new Error('Untrusted origin');
  return url.origin;
}
```
- Bruk `trustedOrigin()` i alle `dispatch*` og ignorer `origin`-parameteren.
- Bruk **egen hemmelighet per funksjon** (nyhetsbrev, survey-e-post og kvitteringer skilles).
- Vurder å signere jobbforespørselen (HMAC over body + tidsstempel, maks 60 sekunder)
  i stedet for en statisk header, så en lekket header ikke kan gjenbrukes.

---

### F-05 – Innloggingslenken forbrukes av GET og ligger i query-strengen (Middels)

**Bevis:** `app/api/member-access/verify/route.js:8` (og `email-change/verify`,
`membership-requests/verify`) endrer tilstand på GET. Engangstokenet forbrukes
umiddelbart.

**Risiko**
- E-postskannere (Microsoft Defender Safe Links, Proofpoint, enkelte antivirus)
  forhåndshenter lenker. Da er engangskoden brukt før medlemmet klikker, og de får
  «ugyldig lenke». Dette er trolig en kilde til support-henvendelser.
- Koden ligger i URL-en og dermed i nettleserhistorikk og eventuelle proxy-logger
  (avbøtt av `no-referrer` og 15 minutters levetid).

**Tiltak:** to-trinns bekreftelse. Lenken peker til en side som viser en knapp, og
først POST forbruker koden.
1. E-postlenke: `/mine-opplysninger/bekreft#token=<hemmelighet>`. Fragmentet sendes
   aldri til serveren.
2. Siden leser `location.hash`, kjører `history.replaceState` for å rense URL-en, og
   viser «Fortsett».
3. Knappen gjør `fetch('/api/member-access/verify', { method: 'POST', body: JSON.stringify({ token }) })`.
   Ruten har origin-sjekk (F-03) og setter sesjonscookien.
4. La GET returnere 405.
Samme mønster for e-postbytte og innmeldingsbekreftelse. Survey-lenken påvirkes ikke
av skannere fordi den kan gjenbrukes til svar er levert.

---

### F-06 – Åpent API lister hele medlemsregisteret per grend (Middels, personvern/design)

**Bevis:** `/api/map/hamlets/[id]/properties` er offentlig (`lib/route-access.js:12`).
`getPublicHamletProperties` (`lib/map/public-map-service.js:89-127`) henter
`h_number, cadastral_number, street_address` for **alle** ikke-slettede medlemmer i
grenden (uten filter på `membership_status`, så også unntatte) og returnerer i tillegg
koordinat og tomtegrense. ID-ene er sekvensielle, og eneste vern er en rate limit i
minnet på 20 per minutt per instans (`lib/rate-limit.js:59`). `Sec-Fetch-Site`-sjekken
stopper bare nettlesere, ikke skript.

**Risiko**
- En skraper får hele registeret med noen få kall (medlemskap knyttet til adresse).
- H-nummer er en av identifikatorene `/api/member-access/request` godtar. Skraperen får
  altså nøklene til å utløse en innloggings-e-post til hvert medlem (e-postbombing,
  begrenset av 10-minutters-grensen per medlem, men det belaster MailerSend-kvoten din).

**Tiltak**
1. Avgjør formålet med kartet. Fjern `hNumber` (og gjerne gnr/bnr) fra det offentlige svaret.
2. Filtrer på `membership_status = 'member'`, og vurder å vise polygon/antall uten adresse.
3. Bruk delt databasebasert rate limit (samme mekanisme som `consumeMemberAccessLimits`).
4. Dokumenter behandlingsgrunnlaget og informer medlemmene. Vurder en reservasjon
   tilsvarende den du allerede har for deling med Turufjell AS.

---

### F-07 – Rate limiting kan låse ute medlemmer; IPv6 og minne (Middels)

**Bevis**
- `lib/shared-rate-limit.js:35-40`: hard 429 når **global** grense (250 per 15 min)
  eller **oppslagsgrense per identifikator** (3 per 15 min) nås.
  - En angriper som roterer IPv6-adresser kan tømme den globale bøtta og dermed stenge
    innlogging for alle medlemmer.
  - Tre kall med et kjent H-nummer/adresse låser ute akkurat det medlemmet i 15 minutter.
  - `-browser`-nøkkelen er en cookie angriperen kontrollerer.
- `lib/rate-limit.js:1-14`: `Map`-ene fjernes aldri (minnelekkasje ved mange IP-er), og
  nøkkelen er full IP. Én IPv6 /64 gir en angriper 2⁶⁴ adresser.
- Netlify-regelen (`netlify/edge-functions/public-member-rate-limit.js`) dekker bare seks
  stier. `/api/member-access/profile`, `/export`, `/survey/api/responses`,
  `/api/usage/pageview` og kart-API-et har bare minnegrensen.

**Tiltak**
- Normaliser IPv6 til /64 før nøkkelbruk:
  ```js
  function clientKey(ip) {
    if (!ip.includes(':') || ip.includes('.')) return ip;
    const [head, tail = ''] = ip.split('::');
    const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
    return [...h, ...Array(8 - h.length - t.length).fill('0'), ...t].slice(0, 4).join(':') + '::/64';
  }
  ```
- Fjern hard 429 på oppslagsgrensen per identifikator. Det finnes allerede en
  10-minutters grense på selve utsendelsen (`member-self-service.js:132`), så
  oppslagsgrensen gir lite mer enn en låsemulighet. Behold telleren for varsling.
- Gjør den globale grensen til en **utfordring** (Turnstile/hCaptcha/proof-of-work) i
  stedet for stans, og velg leverandør ut fra personvern og universell utforming.
- Legg en øvre grense og opprydding på minne-Map-ene, eller fjern dem til fordel for den
  delte databasegrensen.
- Utvid Netlify-regelen til alle offentlige POST-ruter.

---

### F-08 – Timingorakel på innmeldingsskjemaet (Lav)

**Bevis:** `createMembershipRequest` returnerer tidlig for `existing_property` (`:580`),
`recent_request` (`:601`) og `suppressed_recipient`, mens ny søknad går via Kartverket og
MailerSend før `202` sendes (`:606-631`, `membership-requests/route.js:38`). Svarteksten
er lik, men responstiden avslører om en eiendom allerede finnes i registeret.

**Tiltak:** gjør som i `member-access/request`: valider og ratebegrens synkront, kjør
resten i `after()`, og svar alltid `202` umiddelbart.

---

### F-09 – Suppressionlisten hentes live i offentlige flyter (Lav)

**Bevis:** `getMailerSendSuppressions` (`lib/mailer-service.js:171-206`) henter opptil
5 lister × 50 sider fra MailerSend, uten cache. Den kalles fra offentlige stier
(`member-self-service.js:66-71,138,603`).

**Risiko:** forsterkning. Én offentlig forespørsel kan gi mange utgående API-kall, og
MailerSends egen rate limit kan bremse legitim e-post.

**Tiltak:** bruk den lokale tabellen `email_suppressions` (som webhooken allerede
vedlikeholder) i offentlige flyter, og synkroniser leverandørlisten i en planlagt jobb
(watchdog-funksjonen) med cache.

---

### F-10 – Filopplasting: makroformater, ingen virusskanning, EXIF beholdes (Middels)

**Bevis**
- `lib/upload-validation.js:12-26`: kun filsignatur. Tillater `.doc`, `.xls`, `.ppt`
  (OLE, kan inneholde makroer) og `.zip`. Ingen virusskanning.
- Bilder lagres **umodifisert** (`lib/cms-files.js:41`); bare miniatyren re-enkodes med
  sharp. Originalen med EXIF/GPS serveres offentlig via `/api/cms/files/[id]`.
- `sharp` kalles uten eksplisitt `limitInputPixels` (`cms-files.js:22`).
- Filer serveres `inline` med MIME-type fra databasen.
- Kun opplasting krever admin (`cms` eller `surveys`), så risikoen er en kompromittert
  eller uforsiktig redaktør. Men filene leveres til medlemmer og publikum.

**Tiltak**
1. Fjern `doc`, `xls`, `ppt` og `zip`. Behold `pdf`, `docx`, `xlsx`, `pptx`, og avvis
   OOXML som inneholder `vbaProject.bin`.
2. Skann med ClamAV (eller tilsvarende tjeneste) før lagring.
3. Re-enkod alle bilder og lagre resultatet, ikke originalen:
   ```js
   const clean = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error' })
     .rotate()                       // bruker EXIF-orientering, deretter uten metadata
     .toFormat(ext === 'png' ? 'png' : 'webp', { quality: 85 })
     .toBuffer();                    // ikke bruk .withMetadata()
   ```
4. Server ikke-bilder som `attachment`, og legg `Content-Security-Policy: sandbox; default-src 'none'`
   på filresponsene.
5. Håndhev kroppsstørrelse før hele filen leses inn i minnet.

---

### F-11 – Preview-token og nøkkelgjenbruk (Lav)

**Bevis:** `lib/survey-preview.js:8` – gyldig i 24 timer, ikke tilbakekallbar, ligger i
query-strengen og gir anonym tilgang til utkast og vedlegg. `SECURITY_EVENT_HMAC_KEY`
brukes både til preview-signatur, hendelsesnøkler og rate limit-nøkler.

**Tiltak:** kort ned til 1–4 timer eller lagre en `jti` i databasen så den kan
tilbakekalles. Utled separate delnøkler per formål med `crypto.hkdfSync`.

---

### F-12 – Én databaserolle, ingen RLS, ingen oppbevaring, sletterett (Middels)

**Bevis**
- All kode bruker samme `DATABASE_URL` (`lib/db.js`). Ingen `GRANT`/`REVOKE`-oppsett
  utover `audit_log`, ingen RLS. En bug i én offentlig rute har dermed samme rettigheter
  som administrasjonen, og eieren kan slå av audit-triggerne.
- Ingen oppbevaringsregler for `security_events` (append-only, vokser ubegrenset under
  angrep), `audit_log`, `email_deliveries`, `email_webhook_events`, sesjoner.
- Medlemmer slettes bare «mykt» (`deleted_at`), fremmednøkler er `ON DELETE RESTRICT`,
  og `audit_log` lagrer hele rader som JSON (også svar og e-postadresser). Sletterett
  etter GDPR art. 17 lar seg dermed ikke oppfylle i dag.

**Tiltak**
1. Tre roller: `tfv_migrator` (eier, kun migrering), `tfv_web` (kjøretid, minst
   nødvendige rettigheter), eventuelt `tfv_admin` for administrasjonsstier.
   ```sql
   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
   GRANT SELECT, INSERT, UPDATE ON members, member_access_tokens, member_sessions, survey_sessions TO tfv_web;
   GRANT INSERT ON audit_log, security_events TO tfv_web;   -- ingen SELECT/UPDATE/DELETE
   ```
   Bruk to separate connection strings i Netlify.
2. Fastsett og dokumenter oppbevaring (forslag): sesjoner og tokens 30 dager,
   `security_events` 12 måneder, leveringslogg 12 måneder. Partisjoner `security_events`
   og `audit_log` per måned og la eieren droppe gamle partisjoner i en godkjent jobb.
3. Lag en **pseudonymiseringsprosedyre** for sletterett: nullstill navn, e-post og
   adresse på `members`, og redigér tilhørende `audit_log`-rader. Test den på en Neon-gren.

---

### F-13 – Eierskifte og kontaktendringer varsles ikke (Lav)

**Bevis:** `resolveAdminMemberRequest` (`lib/member-self-service.js:805-840`) bytter
hoved-e-post ved godkjent eierskifte, tilbakekaller sesjoner, men sender **ingen varsel
til den gamle adressen**. `updateMemberSelfServiceProfile` endrer `other_contact_emails`
uten varsel til hoved-e-post (disse adressene kan få survey-invitasjoner).

**Tiltak:** send varsel til gammel hoved-e-post når en eierskiftesøknad opprettes og
når den godkjennes, og til hoved-e-post når andre kontaktadresser endres (gjenbruk
`renderEmailChangeNoticeEmail`). Vis gammel og ny verdi side om side i admin-visningen,
og krev at saksbehandler har verifisert identiteten utenfor systemet.

---

### F-14 – Offentlig repo lekker GPS, gren-/snapshot-ID-er og admin-adresser (Middels)

**Bevis**
- **GPS i bilder:** 5 filer i `original_images/` (Canon EOS 5D Mark IV / Hasselblad,
  17. september 2026) har GPS-koordinater rundt 60,47° N, 9,50° Ø, høyde 710–982 m.
  Mappen (57 MB) refereres ikke av noen kode. De publiserte varianten i `public/carousel`
  har ingen EXIF, så det er kun originalene som lekker.
- **Driftsidentifikatorer i `docs/`:** produksjonsgrenen `br-misty-paper-b2tequav`
  (`docs/database-release-survey-options-2026-09-17.md:30`,
  `docs/database-test-survey-options-2026-09-17.md:13`), flere testgren-ID-er og seks
  snapshot-ID-er (`docs/database-migration-*.md`), skjemaets SHA-256, tidspunkter og
  tellinger.
- **Navngitte privilegerte kontoer** i `tests/admin-policy.test.mjs:5,32` (`leder@`,
  `ib@`, `data@turufjellvel.no`) er trolig reelle adresser og peker ut hvem som er admin.
- Dette er ikke credentials, men det senker terskelen for målrettet phishing og
  sosial manipulering mot leverandørstøtte.

**Tiltak**
1. Fjern originalene og stripp metadata:
   ```bash
   git rm -r --cached original_images && echo "original_images/" >> .gitignore
   exiftool -all= -overwrite_original original_images/*     # lokalt, hvis du beholder dem
   ```
2. Fjern dem fra historikken (krever force-push, forks og cacher beholder kopier):
   ```bash
   git filter-repo --path original_images --invert-paths
   ```
3. Erstatt ID-er i `docs/` med plassholdere (`<branch-id>`), eller flytt driftslogger til
   et privat repo/wiki. Bruk `@example.test` i tester.
4. Legg inn `public/.well-known/security.txt` (RFC 9116) og aktiver privat sårbarhetsrapportering
   i GitHub.

---

### F-15 – CI og leverandørkjede (Middels)

**Bevis:** `.github/workflows/ci.yml:33,35`: `actions/checkout@v6` og `setup-node@v7`
pinnes til tag, ikke commit-SHA. Ingen `dependabot.yml`, ingen CodeQL, ingen
`npm audit`/OSV-steg (`AGENTS.md` sier «kjør `npm audit`», men det er manuelt).
`npm ci` kjører livssyklusskript (ett i lockfilen: `unrs-resolver`, dev).
`permissions: contents: read` og bruk av `pull_request` (ikke `pull_request_target`)
er riktig.

Avhengigheter jeg vil se nærmere på (jeg kunne ikke sjekke sårbarhetsstatus offline):
`next-auth 5.0.0-beta.32`, `@material-tailwind/react 3.0.0-beta.24` (begge beta),
`exceljs 4.4.0` (lite vedlikeholdt, med gamle transitive `archiver`/`glob`/`unzipper`;
brukes bare til å skrive, og bør aldri brukes til å lese opplastede filer).

**Tiltak**
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    open-pull-requests-limit: 10
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
```
- Pin actions til SHA (`uses: actions/checkout@<40-tegns-sha> # v6`).
- Legg til `npm audit --omit=dev --audit-level=high` og et CodeQL-workflow.
- Bruk `npm ci --ignore-scripts` og bygg eksplisitt det som trengs.
- GitHub: aktiver secret scanning **og push protection**, Dependabot alerts,
  branch protection på `main` (påkrevde sjekker, minst én godkjenning, ingen force-push),
  og `CODEOWNERS` for `auth.js`, `proxy.js`, `lib/admin-*`, `lib/*-background.js`, `database/`.

---

### F-16 – Nettleserherding (Lav)

- `next.config.mjs`: sett `poweredByHeader: false`.
- `Server-Timing` (åtte steder, blant annet `proxy.js:45-76`) avslører tid brukt på
  autentisering og databaseoppslag. Fjern i produksjon.
- Legg til `Cross-Origin-Opener-Policy: same-origin` og `Cross-Origin-Resource-Policy: same-origin`
  på API-svar, og utvid `Permissions-Policy` (`payment=(), usb=(), interest-cohort=()`).
- `components/MemberPropertyMap.js:25`: legg til
  `sandbox="allow-scripts allow-same-origin allow-popups"` på norgeskart-iframen
  (uten `allow-top-navigation`).
- CSP: `style-src 'unsafe-inline'` er et kjent gjenstående mål (`SIKKERHETSPLAN.md`).
  Legg til `report-to`/`report-uri` uten sensitive URL-er.
- HSTS har `preload`, men det gjør ingenting før apex-domenet er registrert på
  preload-listen. Fjern direktivet eller registrer domenet bevisst.

---

### F-17 – Bruksstatistikk uten rate limit (Lav)

`app/api/usage/pageview/route.js` er offentlig, godtar opptil 4 KB og skriver til
databasen uten begrensning. Dataene er aggregerte og vokser ikke, men statistikken kan
forfalskes og hvert kall er en databaseskriving. Legg på den delte rate limiten eller
bufre og skriv i batch.

---

### F-18 – Personvern i e-post, logg og tredjepartsoppslag (Lav)

- `lib/email-templates.js:44`: survey-invitasjonen lister **alle mottakeradresser på
  samme tomt** til hver mottaker. Vurder å bare si «flere mottakere får varsel».
- `audit_log` lagrer hele `survey_responses`-rader inkl. `member_id`, så undersøkelser er
  ikke anonyme mot administratorer. Sørg for at invitasjonsteksten sier det.
- `MemberPropertyMap.js` sender medlemmets adresse fra nettleseren til
  `ws.geonorge.no` og laster norgeskart.no. Nevn dette i personvernerklæringen
  (`app/informasjonskapsler`).

---

### F-19 – Ingen validering av hemmelighetsstyrke (Lav)

`isAuthConfigured` sjekker bare at `AUTH_SECRET` finnes. Jobbhemmelighetene
(`MATRIKKEL_JOB_SECRET`, `HAMLET_JOB_SECRET`, `MAILERSEND_JOB_SECRET`) godtas hvis de
ikke er tomme; bare survey-stien krever 32 tegn (`lib/survey-email-background.js:17`).
Lag én `assertSecrets()` som kjører både i bygg (`next.config.mjs`) og ved kjøring:
minst 32 tegn, ikke lik hverandre, ikke på en liste over kjente svake verdier.
`MAILERSEND_WEBHOOK_SIGNING_SECRET` som mangler gir i dag avslag, som er riktig.

---

### Vurdert og ikke funnet sårbart

- **SQL-injeksjon:** parametriserte spørringer, hvitlister på dynamiske deler.
- **XSS:** ingen `dangerouslySetInnerHTML`, rik tekst er hvitlistet, e-postmaler
  escaper alle verdier.
- **SSRF:** Matrikkel-URL og Kartverket-verter er faste, `redirect: 'error'`.
- **IDOR:** medlemsendepunkter filtrerer alltid på `member_ids` fra sesjonen;
  survey-vedlegg avgrenses til undersøkelsen sesjonen tilhører.
- **Stiinjeksjon i fillagring:** nøkler genereres på serveren.
- **Åpen redirect:** verify-rutene redirecter til `getApplicationOrigin`, ikke til
  parametere fra brukeren.
- **Excel-formelinjeksjon:** ExcelJS lagrer vanlige strenger som tekstceller (formler
  krever `{ formula }`), så dette er ikke utnyttbart ved åpning av `.xlsx`. Hvis du noen
  gang legger til CSV-eksport, prefiks verdier som starter med `=`, `+`, `-`, `@` med `'`.
- **Test-signeringshemmelighet i webhook:** ufarlig, se kapittel 3.

---

## 6. Sjekkliste utenfor koden

**Microsoft Entra**
- [ ] *Assignment required* = Yes på Enterprise Application
- [ ] App-roller `TFV.*` opprettet og tildelt via grupper; `ADMIN_REQUIRED_ROLES` satt i produksjon
- [ ] Conditional Access: MFA (helst phishing-resistent) for alle administratorer
- [ ] Gjestebrukere kan ikke tildeles appen; ingen delte kontoer
- [ ] Redirect-URI er nøyaktig én produksjons-URL

**Netlify**
- [ ] `AUTH_URL` satt til `https://medlemsservice.turufjellvel.no` (brukes som sikkerhetsanker)
- [ ] Secrets scoped til production-context, ikke til deploy previews
- [ ] Deploylogg bekrefter at rate limit-regelen er aktiv
- [ ] Kontroller faktiske headere: `curl -sI https://medlemsservice.turufjellvel.no/`
- [ ] Ingen `.netlify`/`.neon`-mapper eller `.env*` committet (bekreftet i ZIP-en)

**Neon**
- [ ] Produksjonsrolle roteres hvis den noen gang har vært på en utviklermaskin
- [ ] Bucket `cms-assets` er privat (ingen public-read-policy), siden vedlegg til
      undersøkelser ligger i samme bucket
- [ ] Vurder IP-begrensning eller Neon Private Networking hvis Netlify-egress tillater det
- [ ] `database/security-cleanup.sql` er kjørt (fjerner `members.access_token`)

**GitHub**
- [ ] Secret scanning + push protection, Dependabot alerts og security updates
- [ ] Branch protection på `main`; force-push av
- [ ] Privat sårbarhetsrapportering aktivert
- [ ] Historikk skannet med `gitleaks`/`trufflehog`

**MailerSend**
- [ ] SPF, DKIM og DMARC (`p=quarantine` eller strengere) for `turufjellvel.no`
- [ ] API-token med minst mulige rettigheter; webhook-signeringshemmelighet satt

---

## 7. Foreslått rekkefølge

Avkryssbar liste i samme stil som `ToDo.md`.

**Fase 0 – i dag, uten kodeendring (ca. 1–2 timer)**
- [ ] Bekreft at `AUTH_URL` er satt i produksjon (F-04)
- [ ] Sett `ADMIN_REQUIRED_ROLES` i produksjon og tildel roller i Entra (F-01)
- [ ] Aktiver secret scanning, push protection, branch protection (F-15)
- [ ] Kjør `npm audit`, `gitleaks` mot full klone, sjekk produksjonsheadere
- [ ] Bekreft at bucket er privat og at `security-cleanup.sql` er kjørt

**Fase 1 – uke 1**
- [ ] F-14: fjern `original_images` og GPS, rens `docs/` og tester, `security.txt`
- [ ] F-15: `dependabot.yml`, SHA-pinning, CodeQL, `npm audit`-steg
- [ ] F-03: felles CSRF-vern i `proxy.js`, fjern seks lokale varianter
- [ ] F-04: `trustedOrigin()`, egen hemmelighet per bakgrunnsfunksjon
- [ ] F-19: `assertSecrets()`

**Fase 2 – uke 2–3**
- [ ] F-01: `oid`-binding, roller obligatoriske i produksjon
- [ ] F-05: to-trinns bekreftelse av lenker (POST)
- [ ] F-07: IPv6 /64, fjern oppslagslås, utfordring i stedet for global stans
- [ ] F-08 og F-09: `after()` for innmelding, lokal suppression-tabell
- [ ] F-10: fjern makroformater, re-enkod bilder, virusskanning
- [ ] F-13: varsler ved eierskifte og kontaktendringer

**Fase 3 – måned 1–2**
- [ ] F-02: step-up, kortere økt eller databasesesjoner, varsel ved eksport
- [ ] F-06: avgjør og stram inn det offentlige kartet
- [ ] F-12: databaserollene, oppbevaring og pseudonymisering
- [ ] F-11, F-16, F-17, F-18

**Dynamisk validering i staging (før produksjon)**
- Kryss-origin POST mot alle admin-ruter skal gi 403 (F-03)
- Forhåndshenting av innloggingslenke skal ikke ugyldiggjøre den (F-05)
- Skript som henter alle grender skal treffe rate limit og ikke få H-nummer (F-06)
- Opplasting av `.doc`, `.zip`, og JPEG med GPS skal avvises eller renses (F-10)
- Måling: forskjell i responstid mellom eksisterende og ny eiendom skal forsvinne (F-08)

---

*Rapporten er en statisk kodegjennomgang og erstatter ikke en penetrasjonstest.
Når fase 1–2 er gjennomført, anbefaler jeg en avgrenset ekstern retest av F-01,
F-03, F-05, F-06 og F-10 mot staging med syntetiske data.*

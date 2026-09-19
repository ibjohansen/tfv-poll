# Medlemsservice · Turufjell Vel

En modulbasert medlemsservice bygget med Next.js, React, Node, Neon Postgres og
Neon Object Storage. Den samler medlemsregister, selvbetjening, kartbasert
registerkontroll, kommunikasjon, undersøkelser, bruksstatistikk og et strukturert
CMS for informasjonssider.

## Funksjonsoversikt

- Medlemsregister med søk, serverbaserte filtre, automatisk lagring,
  endringshistorikk, Excel-eksport og matrikkelopplysninger på tomtenivå.
- Sikker medlemsselvbetjening med tidsbegrenset engangslenke, fler-tomtstilgang,
  retting av kontaktopplysninger, eierskifte, innmelding og maskinlesbar egeneksport.
- Reservasjon mot manuell deling med Turufjell AS. Reservasjonen vises i admin og
  selvbetjening, kan filtreres og utelates som standard fra administrativ eksport.
- Oppgaveliste for innmeldinger, eierskifter, kommentarer og
  matrikkelavklaringer, med antall ubehandlede saker på adminforsiden og i menyen.
- Kart- og registerkontroll med lagrede grendepolygoner, Kartverket-adresser,
  eiendomsgrenser, matrikkelreferanser og supplerende vei-/stidata fra Overpass.
- Offentlig grendekart med ett valg per kontrollert grend og behovsstyrt visning
  av H-nummer, gårds-/bruksnummer og adresse, uten medlemmenes kontaktopplysninger.
- Grender og e-postgrupper, nyhetsbrev med forhåndsvisning/testutsending og
  undersøkelser med personlige invitasjoner, resultater og Excel-eksport.
- Strukturert CMS med sanert riktekst, hovedbilder og vedlegg i privat Object
  Storage, samt personvernvennlig, egenhostet statistikk med Visx-grafer.
- Rollebasert administrasjon gjennom Microsoft Entra ID, revisjonsspor og
  kontrollerte Netlify-bakgrunnsjobber for e-post og matrikkelsynkronisering.

## Krav

- Node.js 22.19 eller nyere
- npm
- En Neon-konto og database

## Lokal oppstart

```bash
npm install
cp .env.example .env.local
npm run dev
```

Åpne deretter `http://localhost:3000`.

`npm run dev`, databaseoppsett og medlemsimport bruker systemets sertifikatlager via `--use-system-ca`.
Dette gjør at Node også stoler på sertifikatutstedere installert i operativsystemet,
for eksempel i nettverk med HTTPS-inspeksjon. Ved `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`,
kontroller Node-versjonen og start serveren på nytt med `npm run dev`.
Sertifikatkontrollen skal ikke deaktiveres.

## Sider og tilgang

- `/` er en offentlig forside med logo, bildekarusell, hovedinnhold, kontrollert
  grendekart, medlemsselvbetjening, publiserte artikler og bunnfelt.
- Forsidekarusellen leser bildefiler fra `public/carousel`. Filnavn skal følge
  `[FOTOGRAF]_tf[NUMMER].jpg` (også JPEG, PNG, WebP og AVIF støttes), for eksempel
  `Ib Johansen_tf002.jpg`. Fotografnavnet vises som kreditering på bildet. Bildene
  sorteres på nummeret, byttes automatisk og kan styres med piler, tastaturets
  piltaster, indikatorene eller pauseknappen. Automatisk bildebytte stopper når
  pekeren er over karusellen, når den har tastaturfokus eller redusert bevegelse
  er valgt i operativsystemet.
- **Mine medlemsopplysninger** ligger alltid på forsiden før publiserte artikler.
  Et medlem kan be om en 15-minutters engangslenke med H-nummer, gateadresse eller
  registrert e-postadresse, eller sende inn en ny tomt til behandling.
- `/mine-opplysninger` viser medlemsdata etter at den personlige e-postlenken er
  åpnet. Siden er ikke indekserbar og krever en gyldig HttpOnly-økt.
- Innloggede administratorer får lenke direkte til adminportalen i bunnfeltet;
  øvrige brukere får innloggingslenken.
- Hamburgermenyen åpner Microsoft 365-innlogging via `/admin/login`.
- `/admin` er startsiden for Medlemsservice og viser tilgjengelige moduler.
- `/admin/inbox` er oppgavelisten for innmeldinger, eierskifter og
  matrikkelavklaringer, også når innsenderen ennå ikke har bekreftet e-postadressen.
- `/admin/members` er modulen Medlemsregister.
- `/admin/members/groups` administrerer grender, e-postgrupper og
  medlemstilknytninger.
- `/admin/members/newsletters` oppretter, tester og sender nyhetsbrev til valgte
  e-postgrupper.
- `/admin/members/matrikkel` starter og følger matrikkeloppdatering for ett,
  flere eller alle valgte medlemmer. Tilgang krever matrikkelrettighet.
- `/admin/map` viser kart- og registerkontroll, lagrede grendepolygoner,
  adresser, eiendommer, veier og kobling til medlemsregisteret.
- `/admin/surveys` er modulen Undersøkelser.
- `/admin/web` er CMS-et for nettsider, hovedbilder og nedlastbare vedlegg.
- `/admin/usage` viser anonym, aggregert bruksstatistikk og krever
  revisjonsrettighet.
- `/admin/audit` er den administratorbeskyttede oversikten Brukerendringer med
  før- og etterverdier for endringer i sentrale tabeller.
- `/<slug>` viser en publisert informasjonsside. Utkast kan bare forhåndsvises
  fra administrasjonen.
- De seks sist publiserte informasjonssidene vises automatisk på `/`.
- Undersøkelsen ligger på `/survey`; invitasjonens personlige kode utveksles via
  `/api/survey-access/verify` og fjernes straks fra adresselinjen. Lenken kan
  åpnes på nytt for å opprette en ny kortvarig økt frem til svar, tilbakekalling
  eller utløp.
- Svar sendes til `/survey/api/responses`. Vedlegg som lastes opp på undersøkelsen
  i admin, leveres tilgangskontrollert fra privat Object Storage. Eldre statiske
  dokumenter kan fortsatt ligge under `/survey/dokumenter/`.
  Skjemaet sender vist `questionVersion`; endret spørsmålsversjon avvises med
  konflikt før lagring, og medlemmet må laste inn spørsmålene på nytt.
- Andre sider og API-er krever autorisert innlogging som standard, også nye ruter.
  Innloggingsendepunkter og nødvendige statiske ressurser er offentlige.
- Query-formatet `?klm=...&xyz=...` finnes bare i syntetisk mockmodus og skal
  aldri brukes til produksjonsinvitasjoner.

## Arkitektur

Skissene følger nivåene i [C4-modellen](https://c4model.com/): først systemets
kontekst, deretter containere (kjørbare eller lagrende deler). Mermaid-diagrammene
renderes direkte i GitHub og de fleste Markdown-visere.

### Språk og locales

Webgrensesnittet og brukerrettede API-svar støtter norsk bokmål og engelsk.
Norsk er standard, mens språkvelgeren lagrer valget i en sikker HTTP-only
cookie. Ordlistene er gruppert etter funksjonsområde under `locales/`; se
[språkdokumentasjonen](docs/internationalization.md) for struktur, avgrensning
og fremgangsmåte for nye språk. Ingen ekstra i18n-avhengighet er nødvendig.

### Systemkontekst

```mermaid
flowchart LR
  member["Medlem\nbruker personlig undersøkelses- eller selvbetjeningslenke"]
  admin["Administrator\n@turufjellvel.no"]
  app["Medlemsservice\nNext.js-applikasjon for Turufjell Vel"]
  entra["Microsoft Entra ID\nidentitetsleverandør"]
  neon[("Neon Postgres\nmedlemmer, undersøkelser, svar og CMS-metadata")]
  storage[("Neon Object Storage\nbilder og vedlegg")]
  mailer["MailerSend Email API\ntransaksjonell levering"]
  mapdata["Kartverket / Geonorge / OSM\noffisielle og supplerende kartdata"]

  member -->|"Ser data, retter kontaktfelt eller svarer"| app
  admin -->|"Administrerer medlemmer, undersøkelser og nettsider"| app
  app -->|"Logger inn administrator"| entra
  app -->|"Leser og skriver data"| neon
  app -->|"Lagrer og henter CMS-filer"| storage
  app -->|"Sender e-post server-side"| mailer
  app -->|"Henter og normaliserer geografiske data"| mapdata
```

### Containere

```mermaid
flowchart TB
  browser["Nettleser\nOffentlig forside, undersøkelse og Medlemsservice"]
  next["Next.js / Node.js\nApp Router, sider, API-ruter og tilgangskontroll"]
  auth["Auth.js\nMicrosoft Entra ID-integrasjon"]
  db[("Neon Postgres\nmembers · member_requests · surveys · responses · CMS")]
  storage[("Privat Neon Object Storage\ncms-assets")]
  files["Eldre statiske dokumenter\npublic/survey/dokumenter"]
  matrikkel["Kartverket\nAdresse-API, A5 og Matrikkel SOAP-API"]
  norgeskart["Kartverket Norgeskart\ninnbygd eiendomskart"]
  geodata["Kartverket / Geonorge / Overpass\nadresser, teiger, veier og stier"]
  worker["Netlify Background Function\nmatrikkelsynkronisering"]
  hamletworker["Netlify Background Function\ngrende- og tomtekobling"]
  emailworker["Netlify Background Function\nsurvey-utsendelse"]
  mailer["MailerSend Email API\nlevering og suppression"]

  browser -->|"HTTPS"| next
  next -->|"OAuth/OIDC"| auth
  auth -->|"Innlogging"| entra["Microsoft Entra ID"]
  next -->|"TLS, server-side DATABASE_URL"| db
  next -->|"S3 API, server-side credentials"| storage
  next -->|"Leverer"| files
  next -->|"Starter rollebeskyttet jobb"| worker
  next -->|"Lagrer kontrollert grend og starter rematch"| hamletworker
  next -->|"Starter bekreftet utsendelse"| emailworker
  emailworker -->|"Personlige meldinger over HTTPS"| mailer
  mailer -->|"Signerte delivery/bounce-webhooks"| next
  worker -->|"Server-side API-kall"| matrikkel
  browser -->|"Adresseoppslag og kartvisning"| norgeskart
  next -->|"Avgrensede server-side oppslag"| geodata
  worker -->|"Snapshot, status og oppdateringer"| db
  hamletworker -->|"Entydige grendekoblinger"| db
  hamletworker -->|"Offisielle adressepunkter"| geodata
```

`DATABASE_URL` brukes bare på serveren. Nettleseren mottar aldri database-
eller Entra-hemmeligheter. `proxy.js` stanser ikke-offentlige ruter før de når
sider eller API-ruter, og datafunksjonene kontrollerer administratortilgang en
gang til.

### Dataansvar

| Del | Ansvar |
| --- | --- |
| `app/survey/page.js` og `lib/membership.js` | Validerer den personlige lenken og henter kun medlemmet og undersøkelsen lenken gjelder. |
| `app/survey/api/responses/route.js` | Validerer svar, lenke, origin og rategrense før svaret lagres. |
| `app/api/survey/files/*` og `lib/survey-files.js` | Leverer undersøkelsesvedlegg fra privat lagring bare til riktig surveyøkt eller administrator. |
| `app/admin/*` og `app/api/admin/*` | Viser og endrer medlemmer/undersøkelser etter Microsoft-innlogging. |
| `app/api/member-access/*` og `lib/member-self-service.js` | Matcher medlem server-side, sender tidsbegrenset tilgangslenke, validerer den hash-lagrede hemmeligheten og tillater bare retting av kontaktfeltene. |
| `app/api/membership-requests/*` | Tar imot ny innmelding, verifiserer oppgitt e-post og legger forespørselen i administrativ behandlingskø. |
| `app/api/admin/member-requests/*` | Krever Entra-basert administratortilgang og godkjenner eller avviser verifiserte eierskifter og innmeldinger. |
| `app/admin/web/*` og `app/api/admin/cms/*` | Administrerer strukturert sideinnhold og filmetadata. Alle endringer krever adminøkt. |
| `app/admin/audit`, `lib/admin-audit.js` og databasetriggere | Viser et skrivebeskyttet revisjonsspor for medlemmer, henvendelser, undersøkelser, svar, nettsider og vedlegg. |
| `app/admin/usage`, `app/api/usage/pageview` og `lib/usage-statistics.js` | Lagrer og viser kun tillatte dagsaggregater for sidetype og grov enhetskategori, adskilt fra brukerloggen. |
| `app/admin/map`, `components/MapExplorer/*` og `lib/map/*` | Holder kildeintegrasjon, GeoJSON-analyse, grender og registerkobling adskilt fra kartgrensesnittet. |
| `components/PublicHamletMap*` og `lib/map/public-map-service.js` | Viser kontrollerte grender offentlig og utleverer bare H-nummer, matrikkelnummer, adresse og sikker adresse-/teiggeometri. |
| `app/admin/members/groups` og `lib/member-groups.js` | Administrerer grender/e-postgrupper og medlemstilknytning med eksplisitte massevalg. |
| `app/admin/members/newsletters`, `lib/newsletters.js` og bakgrunnsfunksjonen | Oppretter dedupliserte mottakerutvalg og kontrollerte nyhetsbrevjobber uten å blande leveringsdata inn i medlemsgrupper. |
| `app/[slug]/page.js` og `components/CmsPageView.js` | Viser kun publiserte sider med systemstyrt typografi og avsnitt. |
| `app/api/cms/files/*` og `lib/cms-storage.js` | Leverer filer fra en privat bøtte etter kontroll av publiseringsstatus eller adminøkt. |
| `lib/admin-*.js` | Felles serverlogikk for sortering, opprettelse, oppdatering og myk sletting. |
| `lib/matrikkel-client.js` | Server-side klient for Adresse-API, A5-avvik og Matrikkelens SOAP-tjenester. |
| `lib/matrikkel-sync.js` | Oppretter sikkerhetskopi, behandler medlemmer og lagrer fremdrift og avvik. |
| `netlify/functions/matrikkel-sync-background.mjs` | Kjører lange synkroniseringer uten å holde nettleserforespørselen åpen. |
| `lib/map/hamlet-member-sync.js` og `netlify/functions/hamlet-member-sync-background.mjs` | Beregner alle kontrollerte grender samlet og oppdaterer sikre tomtekoblinger etter polygonendringer. |
| `lib/mailer-service.js` og `lib/survey-email.js` | Validerer og sender e-post server-side, bygger personlig survey-invitasjon og holder MailerSend-detaljer utenfor resten av applikasjonen. |
| `lib/email-templates.js` | Rendrer også de profilerte tilgangs- og innmeldingsmailene som HTML og ren tekst. |
| `app/api/webhooks/mailersend` | Validerer HMAC-signatur og registrerer nødvendige leverings- og bounce-hendelser idempotent. |
| `netlify/functions/survey-email-background.mjs` | Behandler en databasebasert utsendelseskø kontrollert uten å holde nettleserforespørselen åpen. |
| Neon Postgres | Holder medlemsdata, spørsmålsoppsett, besvarelser, sideinnhold og filmetadata. |
| Neon Object Storage | Holder binære bilder og vedlegg i den private bøtten `cms-assets`. |

## Flytdiagrammer

### Medlemslenke og innsending av svar

```mermaid
sequenceDiagram
  actor M as Medlem
  participant B as Nettleser
  participant A as Next.js
  participant D as Neon Postgres

  M->>B: Åpner personlig invitasjonslenke
  B->>A: GET /api/survey-access/verify
  A->>D: Validerer hashet token og oppretter kort surveyøkt
  A-->>B: Setter HttpOnly-cookie og videresender til ren /survey-URL
  B->>A: GET /survey med surveyøkt
  A->>D: Henter åpen undersøkelse og kun nødvendige tomtefelt
  A-->>B: Skjema eller tydelig tilgangs-/statusmelding
  M->>B: Velger ja, nei eller usikker
  B->>A: POST /survey/api/responses
  A->>A: Validerer origin, rategrense, surveyøkt og svar
  A->>D: Lagrer én besvarelse per medlem og undersøkelse
  D-->>A: Bekreftelse eller duplikatfeil
  A-->>B: Kvittering eller forklaring
```

### Innsyn og retting av medlemsopplysninger

```mermaid
sequenceDiagram
  actor M as Medlem
  participant B as Nettleser
  participant A as Next.js
  participant D as Neon Postgres
  participant E as MailerSend

  M->>B: Oppgir H-nummer, adresse eller e-post
  B->>A: POST /api/member-access/request
  A->>D: Søker og begrenser misbruk uten å avsløre treff
  A-->>B: Returnerer samme svar ved treff og ikke-treff
  A->>D: Lagrer SHA-256-hash med 15 minutters utløp ved treff
  A->>E: Sender personlig tilgangslenke til registrert hoved-e-post
  M->>A: Åpner lenken
  A->>D: Konsumerer engangskoden atomisk og oppretter separat 45-minutters økt
  A-->>B: Setter __Host-/HttpOnly-cookie og fjerner koden fra URL-en
  M->>B: Retter kontaktfelt, bekrefter e-postbytte eller melder eierskifte
  B->>A: PATCH /api/member-access/profile
  A->>D: Oppdaterer kontaktfelt eller oppretter behandlingssak
```

### Administrasjon av medlemmer og undersøkelser

```mermaid
sequenceDiagram
  actor A as Administrator
  participant B as Nettleser
  participant N as Next.js/proxy
  participant E as Microsoft Entra ID
  participant D as Neon Postgres

  A->>B: Åpner /admin, /admin/members eller /admin/surveys
  B->>N: GET administrasjonsside
  N->>E: Verifiserer Auth.js-økt ved behov
  E-->>N: Tenant og identitet
  N->>N: Krever @turufjellvel.no og eventuell allowlist
  N->>D: Henter aktive, ikke-slettede data
  D-->>N: Oversikt
  N-->>B: Tabell med sortering og uendelig rulling
  A->>B: Oppretter, endrer eller velger sletting
  B->>N: POST/PATCH/DELETE til admin-API
  N->>N: Kontrollerer adminrettighet på nytt
  N->>D: Skriver endring eller setter deleted_at
  D-->>N: Resultat
  N-->>B: Oppdatert panel eller feilmelding
```

Sletting er alltid myk: medlemmer får `deleted_at` og tilbakekalt medlemslenke,
mens undersøkelser får `deleted_at` og lukkes. Vanlige oppslag filtrerer bort
slike rader; historiske svar beholdes.

### Opprettelse og publisering av nettside

```mermaid
sequenceDiagram
  actor R as Redaktør
  participant B as Nettleser
  participant N as Next.js
  participant D as Neon Postgres
  participant S as Privat Object Storage

  R->>B: Fyller ut faste innholdsfelter
  B->>N: Lagrer utkast
  N->>N: Validerer tittel, slug, kategori og tekstlengder
  N->>D: Oppretter eller oppdaterer cms_pages
  opt Bilde eller CMS-vedlegg
    B->>N: Laster opp fil
    N->>N: Kontrollerer størrelse, filtype og filsignatur
    N->>S: Lagrer fil med tilfeldig lagringsnøkkel
    N->>D: Lagrer filmetadata og rekkefølge
  end
  R->>B: Velger Publiser
  B->>N: Endrer status
  N->>D: Setter status og published_at
  N-->>B: Offentlig side tilgjengelig på /slug
```

Redaktøren kan bare beskrive innholdet. Datamodellen har ingen HTML, Markdown,
fontvalg, farger eller egendefinert styling. React rendrer teksten som ren tekst,
og frontend bestemmer automatisk avsnitt, typografi, avstander og responsiv layout.

## Lokal testing uten database

Aktiver mock-modus ved å sette `MOCK_DATA=true` i `.env.local`.
Start eller start utviklingsserveren på nytt med `npm run dev`.
Ingen database brukes til medlemsoppslag eller innsendinger i denne modusen.
Alle medlemsopplysningene er fiktive. Når mockmodus er av, skal lokal utvikling
alltid bruke en isolert schema-only development-gren med syntetiske data.
Produksjonsforbindelsen skal ikke ligge i lokal standardkonfigurasjon.
Den e-postbaserte medlemsselvbetjeningen og behandlingskøen kan ikke testes i
mock-modus og utfører ingen reell utsendelse der; de krever Neon og en bevisst
aktivert MailerSend-konfigurasjon.

Disse gamle query-lenkene er kun test-fixtures for mockmodus:

- [Gyldig medlem, ikke svart](http://localhost:3000/survey?klm=11111111111111111111111111111111&xyz=616fd7e9e244b6f4947eb1822dbd01ad)
- [Har allerede svart](http://localhost:3000/survey?klm=22222222222222222222222222222222&xyz=616fd7e9e244b6f4947eb1822dbd01ad)
- [Medlem med manglende valgfrie opplysninger](http://localhost:3000/survey?klm=33333333333333333333333333333333&xyz=616fd7e9e244b6f4947eb1822dbd01ad)
- [Ukjent medlem](http://localhost:3000/survey?klm=ffffffffffffffffffffffffffffffff&xyz=616fd7e9e244b6f4947eb1822dbd01ad)
- [Feil ID-format](http://localhost:3000/survey?klm=feil&xyz=616fd7e9e244b6f4947eb1822dbd01ad)
- [Manglende ID](http://localhost:3000/survey)
- [Ugyldig undersøkelse](http://localhost:3000/survey?klm=11111111111111111111111111111111&xyz=ukjent)
- [Simulert databasefeil](http://localhost:3000/survey?klm=dddddddddddddddddddddddddddddddd&xyz=616fd7e9e244b6f4947eb1822dbd01ad)

Testsvar lagres som lokale JSON-filer i `.mock-data/` (ignorert av Git),
og beholdes ved omstart. Etter innsending viser samme lenke at tomten har svart.
Slett `.mock-data/` for å nullstille innsendte testsvar. Medlem 2 vil alltid
være forhåndsregistrert som besvart. Mock-feltene er konfigurert i
`data/mock-members.js`. Sett `MOCK_DATA=false` og start serveren på nytt når
Neon-databasen er klar. Det skjer ingen automatisk overgang til mock ved databasefeil.

## Neon CLI og prosjektoppsett

Neon CLI og prosjektets Neon-verktøy kan brukes lokalt. CLI-innlogging og
eventuell MCP-innlogging fullføres separat i nettleseren. Konkrete prosjekt-,
gren- og endpoint-ID-er skal ligge i intern driftsdokumentasjon, ikke her.

Konfigurasjonen ligger i `neon.mjs` (JavaScript), med:

```js
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    buckets: {
      "cms-assets": {},
    },
  },
});
```

Ved oppsett på en ny maskin skal standardkoblingen peke på en isolert
schema-only development-gren med syntetiske data, aldri produksjon:

```bash
neon login
neon link --project-id <project-id> --branch <development-branch> -y
neon config plan
neon deploy
```

Neon henter tilkoblings- og lagringsvariabler til en lokal miljøfil ved
tilkobling/deploy.
Sørg for at appens `DATABASE_URL` i `.env.local` er den nye verdien; `.env.local`
har prioritet dersom Neon skriver til `.env`. Ikke sjekk inn disse filene.
`neon deploy` anvender Neon-konfigurasjonen. Det publiserer ikke Next.js-appen
og kjører ikke `database/schema.sql`; databaseoppsettet nedenfor er et eget steg.

`cms-assets` er privat. Neon oppretter/henter lokalt `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3` og `AWS_REGION`. Netlify reserverer
flere `AWS_*`-navn til sin egen Functions-runtime. Legg derfor de samme verdiene
inn i Netlify som `NEON_STORAGE_ACCESS_KEY_ID`, `NEON_STORAGE_SECRET_ACCESS_KEY`,
`NEON_STORAGE_ENDPOINT` og `NEON_STORAGE_REGION`. Ingen av dem skal ha
`NEXT_PUBLIC_`-prefiks. Se
[Netlifys begrensninger for Functions-variabler](https://docs.netlify.com/build/functions/environment-variables/#overrides-and-limitations).
Test helst `neon deploy` på en egen Neon-gren før samme konfigurasjon anvendes på
produksjonsgrenen.

## Database

1. Opprett et prosjekt i Neon.
2. Åpne SQL Editor.
3. Legg både en pooled `DATABASE_URL` og direkte `DATABASE_URL_UNPOOLED` i `.env.local`.
4. Trykk `Connect` i Neon og kopier connection string.
5. Legg den i `.env.local`:

```env
DATABASE_URL=postgresql://...-pooler...
DATABASE_URL_UNPOOLED=postgresql://...
```

6. Sett `APP_ENVIRONMENT=development` og kjør `npm run db:setup`. Skriptet
   krever den direkte URL-en og avviser miljømismatch, slik at migrering aldri
   går via PgBouncer eller utilsiktet mot et annet miljø.

## Strukturert CMS

CMS-et ligger på `/admin/web`. Oversikten har søk, status- og kategorifilter,
sortering og stabile redigeringslenker. Redigering skjer på `/admin/web/[id]`,
slik at tilbakeknappen og en delt URL beholder listekonteksten. På mobil brukes
hele skjermen. En side består av:

- obligatorisk tittel og automatisk foreslått URL-slug
- kategori, valgfri ingress og valgfri hovedtekst
- valgfritt hovedbilde med alt-tekst og bildetekst
- inntil 20 vedlegg med visningsnavn og redigerbar rekkefølge
- status `Utkast`, `Publisert` eller arkivert, samt full versjonshistorikk

Lagring er eksplisitt; skriving starter ingen bakgrunnskall. Hver lagring bruker
optimistisk versjonskontroll og oppretter en komplett revisjon. Ved konflikt kan
redaktøren hente serverversjonen eller kopiere sitt lokale utkast. En publisert
revisjon vises offentlig til en nyere kladd eksplisitt publiseres. Historiske
revisjoner kan gjenopprettes som en ny revisjon. Planlagt publisering er med
hensikt ikke tilbudt uten en pålitelig jobbmekanisme.

Tekst lagres som et strengt sanert JSON-tre uten HTML, Markdown, egendefinerte
stiler eller vilkårlige noder. Redaktøren har avsnitt, overskriftsnivå 2–3,
lister, sitat, fet/kursiv og sikre lenker. Publisering kjører kvalitetskontroll
for blant annet ingress, alt-tekst, overskriftsnivåer, lenketekst og dokumentnavn.
Feil blokkerer; advarsler krever en redaksjonell begrunnelse.

Hovedbilder støtter JPG, PNG og WebP opp til
10 MB. Vedlegg støtter PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, ZIP, JPG, PNG, WebP og
GIF opp til 20 MB per fil. Filinnhold kontrolleres mot filendelsen før opplasting.
Opplastinger kjører maksimalt tre samtidig og kan prøves på nytt enkeltvis.
Bilder får en servergenerert WebP-miniatyr. Mediebiblioteket søker på navn og
side, filtrerer type/dato og kopierer private objekter ved gjenbruk; interne
lagringsnøkler sendes aldri til nettleseren.

Publiserte sider vises på `/<slug>` og på forsiden. Forhåndsvisning av utkast
krever adminøkt. Sider og filmetadata mykslettes med `deleted_at`; vanlige
spørringer henter dem aldri. Binærfilen beholdes i lagringsbøtten når redaktøren
sletter den, slik at slettingen er reverserbar på datanivå.

Løsningen bruker bevisst eksisterende React-state og servervalidering. React
Hook Form, Zod og et drag-and-drop-bibliotek er ikke lagt til fordi de fire
seksjonene og knappbasert filrekkefølge ikke forsvarer ekstra klientkode eller
en parallell valideringsmodell.

## Undersøkelsesvedlegg

For nye undersøkelser åpner administratoren undersøkelsen under
`/admin/surveys` og bruker **Vedlegg** i innstillingsfanen. Flere filer kan
velges samtidig. PDF, Office-dokumenter, ZIP og vanlige bildeformater støttes,
med en grense på 20 MB per fil og 20 aktive vedlegg per undersøkelse.

Binærfilene lagres i den private Object Storage-bøtten `cms-assets`, mens
`survey_attachments` bare lagrer metadata og en intern lagringsnøkkel. En
mottaker får kun laste ned vedlegg for undersøkelsen den aktive surveyøkten
gjelder. Administrator kan åpne, endre visningsnavn og mykslette vedlegg.
Lagringsnøkler og filinnhold tas ikke med i brukerloggen.

Databasemigreringen og applikasjonsversjonen ble publisert i produksjon
17. september 2026. Deploy `6aabcf7534ce877445bd1bb3` bestod lokale kontroller
og offentlige røykprøver. Før funksjonen tas i ordinær bruk skal en innlogget
administrator fortsatt laste opp og fjerne en ufarlig testfil og kontrollere
nedlasting både med riktig surveyøkt og uten tilgang, som beskrevet i
verifikasjonssjekklisten nedenfor.

Rettelsesdeploy `6aabda71bcbad489e7278851` samme dag la i tillegg inn
produksjonsvern for undersøkelsesutsendelser og aktiv jobbhemmelighet for
`survey-email-background`. Deployen startet ingen eksisterende kampanje.

Den tidligere statiske løsningen beholdes for bakoverkompatibilitet. Eldre
PDF-er eller andre filer kan ligge i:

```text
public/survey/dokumenter/
```

Registrer dem i `data/survey.js` i arrayet `surveyDocuments`. Nye dokumenter bør
lastes opp direkte på den aktuelle undersøkelsen i admin i stedet.

Eksempel:

```js
export const surveyDocuments = [
  {
    title: "Informasjon om Kristnatten",
    description: "Relevant bakgrunnsdokument før du svarer.",
    href: "/survey/dokumenter/kristnatten.pdf",
    meta: "PDF",
  },
];
```

## GitHub

Prosjektet er privat, med `license: UNLICENSED` i `package.json`; det gis ikke
en åpen kildekode-lisens. Se [npm om privat lisensmerking](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#license).
Arbeidsregler finnes i AGENTS.md og denne filen; egne CONTRIBUTING- og
CODE_OF_CONDUCT-filer er utelatt for det lille, lukkede utviklingsmiljøet.
`.editorconfig` samordner editoroppsett, og CHANGELOG.md har en «Ikke publisert»-seksjon.
Foreslåtte GitHub topics: `nextjs`, `react`, `javascript`, `netlify`, `neon`,
`membership-management`, `geojson`. Topics/beskrivelse på GitHub må oppdateres
separat av repository-eier; ingen GitHub-innstilling er endret her.

Prosjektet bruker `main` som produksjonsgren. Pushes til `main` og alle pull requests
kontrolleres av GitHub Actions-konfigurasjonen i `.github/workflows/ci.yml`:

```bash
npm ci
npm run check
```

`npm run check` kjører ESLint, alle Node-testene og et komplett Next.js-
produksjonsbygg. Bygget bruker Next.js' støttede `--webpack`-flagg for stabil
kjøring i CI- og Functions-miljøer; lokal utvikling bruker fortsatt standardbyggeren.
Lokale miljøfiler, Neon-koblingen og Netlifys lokale
cachemappe er utelatt fra Git gjennom `.gitignore`.

GitHub Actions er ikke et krav for å bruke Netlify. Vi beholder Actions fordi
arbeidsflyten gir en separat kvalitetskontroll på pull requests uten tilgang
til produksjonshemmeligheter. Netlify bygger og publiserer applikasjonen med
`npm run build`; den kommandoen kjører ikke lint eller tester. Push til en
arbeidsgren uten pull request kjører ikke CI. Dette unngår doble CI-kjøringer
for samme endring på arbeidsgrenen og pull requesten.

Konfigurer `quality` fra arbeidsflyten **Code quality** som en påkrevd statuskontroll
for `main`, og krev pull request før innfletting. Dette er en separat
GitHub-innstilling; workflow-filen aktiverer ikke grenbeskyttelse. Netlify venter
ikke automatisk på Actions når noen pusher direkte til `main`. Hvis direkte
push fortsatt skal tillates, må en egen kvalitetsport avtales, for eksempel
`npm run check` som Netlify-byggkommando. Se
[Netlifys byggkonfigurasjon](https://docs.netlify.com/build/configure-builds/overview/)
og [GitHubs påkrevde statuskontroller](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging).

### Automatiserte tester og brukerlogg

Utvidede tester:

```bash
# Egen lokal Postgres, database tfv_test. Aldri DATABASE_URL eller .env.local.
TEST_DATABASE_URL=postgresql://tfv_test:tfv_test_local_only@127.0.0.1:55438/tfv_test npm run test:integration
# Valgfri måling av loggsøk på 100 000 syntetiske poster; måledata rulles tilbake:
TEST_DATABASE_URL=postgresql://tfv_test:tfv_test_local_only@127.0.0.1:55438/tfv_test node scripts/benchmark-audit.mjs
# Installer nettleseren én gang:
npx playwright install chromium
npm run test:e2e
```

Postgres-testene bruker som standard bare loopback og databasen `tfv_test`.
Bruk en separat testcontainer, ikke en eksisterende utviklingsdatabase.
Dataene er syntetiske. En eksplisitt godkjent, midlertidig Neon-schema-only-gren
kan brukes med `scripts/test-neon-branch.mjs` når lokal Postgres mangler:

```bash
node --use-system-ca scripts/test-neon-branch.mjs \
  --project <prosjekt-id> --branch <godkjent-testgren-id> --host <direkte-endepunkt>
# Målrettet feilsøking kan avgrenses til én fil med --test cms.test.mjs.
# CMS-rollback og påfølgende full skjema-reapply på den samme bevoktede grenen:
node --use-system-ca scripts/test-cms-rollback.mjs \
  --project <prosjekt-id> --branch <godkjent-testgren-id> --host <direkte-endepunkt>
```

Opprett grenen separat med `--schema-only` og et kort automatisk utløp. Kjøreren
krever en ikke-standard, ubeskyttet `test-*`-gren med `init_source=parent-schema`
og utløp innen sju dager. Den sjekker at alle tabeller er tomme før den setter
utviklingsmarkør og syntetiske eldre data. Senere kjøringer krever samme
testmarkør. Direkte forbindelse med verifisert TLS brukes; pooled endepunkt
eller produksjons-/stagingmarkør avvises. Forbindelsen hentes i minnet fra Neon
CLI og skrives ikke til disk eller konsoll. `TEST_NEON_HOST`, `TEST_NEON_BRANCH_ID`
og `TEST_NEON_RUN_ID` gis bare til underprosessen, aldri til Netlify.
`.env.local` lastes eller endres ikke, og eksterne e-post-/lagringskall erstattes.
Ingen deploy eller produksjonsmigrering inngår i kommandoen. Se
[godkjent testkjøring 17. september](docs/database-test-survey-options-2026-09-17.md).
Rollback-kjøreren krever i tillegg integrasjonstestmarkøren og avviser derfor en
ny eller ubevoktet gren. Den destruktive rollback-filen er ikke en
produksjonsprosedyre.

Ved den særskilt godkjente survey-migreringen brukes
`scripts/release-survey-schema.mjs` med eksplisitt vert, miljø, handling og
bekreftelse. `status` er bare lesing. `migrate` krever verifisert snapshot-ID i
produksjon, ingen aktive/ventende jobber og nøyaktig SHA-256 for det testede
skjemaet. Migreringen og sju midlertidige skrivesperrer lagres atomisk;
radantall og kontrollsummer for 14 eksisterende tabeller må være uendret.
Sperrene stopper svar, tilgangsøkter og utsendelsesendringer mens deployen byttes,
uten å endre undersøkelsenes åpnet/lukket-status. I dette korte vinduet må slike
handlinger prøves igjen. `resume` fjerner bare sperrene og deres funksjon,
og skal først kjøres etter verifisert publisering av tilhørende kode.
Ved deployfeil beholdes sperrene; ikke publiser gammel svarkode mot nytt skjema.
Skriptet leser direkte `DATABASE_URL_UNPOOLED` fra prosessen, ikke `.env.local`,
og skriver verken raddata eller credentials. Ingen ny Netlify-variabel trengs.

Playwright starter en midlertidig appkopi uten `.env`-filer, uten DB-forbindelse,
med deaktivert e-post og eksisterende mockregister. Administrator får en signert
testsesjon med en separat syntetisk hemmelighet; ingen innloggingsbakdør er
lagt til i applikasjonen. Entra OAuth testes ikke av denne flyten.
En fixture-side med virkelige komponenter og syntetiske data kopieres kun til
den midlertidige appen. Den finnes ikke under prosjektets `app/` eller i
produksjonsbygget. Flytene dekker også profil, oppgaveliste, logg, grupper,
nyhetsbrev, CMS-riktekst og utsendingsfeil. Alle leverandørkall er blokkert/mocket.
Installerte Chrome kan brukes lokalt med `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`.
CI kjører også begge testnivåene i `quality`, med egen Postgres-container og Chromium.

Kjør `npm test` for modul- og rutetester, eller `npm run check` for lint, tester
og produksjonsbygg. Rutetestene bruker ekte Next.js Request/Response-objekter
og kjører rutekoden med eksplisitt erstattede avhengigheter. Testkommandoens
`--experimental-vm-modules` brukes bare til denne isolasjonen; det er ikke
et runtime-flagg for Netlify. `pg` og `@playwright/test` er utviklingsavhengigheter;
Tiptap (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`) brukes i editoren.
`proj4` brukes server-side til WFS-koordinater; eksisterende XML-parser beholdes.

[Kvalitetsgjennomgangen](docs/quality-review.md) beskriver rutedekning,
begrensninger, anbefalte neste tester og vurderingen av hvilke hendelser som
bør registreres. Modul- og nettlesertestene bruker ingen eksterne tjenester.
Reelle transaksjoner testes i lokal Postgres eller en særskilt godkjent,
isolert Neon-testgren. Microsoft, MailerSend, filstorage og Kartverket er
erstattet i testene. Entra OAuth og Netlify/Neon-produksjon er ikke simulert fullt ut.

`/admin/audit` har søk i aktør, post-ID og før-/etterverdier, samt filtre for
bruker, område, endringstype, status og datointervall. Datoene er hele kalenderdager
i `Europe/Oslo`, inkludert valgt sluttdato. Filtrering og sideinndeling skjer på
serveren med 50 poster per side. Store fritekstsøk trenger fortsatt måling og
eventuell indeksering; se kvalitetsgjennomgangen.

Generering av medlems- og resultatseksporter logges i eksisterende `audit_log`
under området **Administrativ handling** (`table_name = admin_actions`). Hendelsen
inneholder administrator, tidspunkt, eksporttype, antall poster, utvalg og
undersøkelses-ID. Ingen medlemsliste, rå e-postadresser, token eller filinnhold
legges til i hendelsen. Den bekrefter at filen er generert, ikke at nettleseren
har mottatt den. Kan hendelsen ikke lagres, returneres ikke eksportfilen.
Mock-eksport av undersøkelsesresultater oppretter ingen databasehendelse.
Dette bruker dagens skjema og krever ingen ny migrering eller miljøvariabel.

## Kart, grender og registerkontroll

Administratorkartet på `/admin/map` bruker Leaflet og GeoJSON. **Søkepolygon**
ligger øverst og kan tegnes, redigeres eller slettes; Turf beregner areal,
bounding box og eksakt geografisk avgrensning. Kartet kan vise adresser,
eiendommer/teiger, veier og lagrede grender som separate lag. Ekstern API-logikk
ligger i `lib/map`, slik at datakilder kan byttes uten å bygge om UI-et.

Grendene er navngitte polygoner i `member_hamlets`, ikke hardkodede kartutkast.
Valg i kart eller nedtrekksliste utfører samme handling og zoomer til polygonet.
Administrator kan opprette, redigere, kontrollere og fjerne polygonet med
versjonskontroll; fjerning av geometri sletter ikke grenden eller eksisterende
medlemstilknytninger. Når et polygon lagres som kontrollert, startes en samlet
rematch av alle kontrollerte grender i bakgrunnen. Kartet ligger til høyre for grendeeditoren på brede skjermer
og tilpasser seg mobilvisning.

Adresse- og eiendomsobjekter kobles til medlemsregisteret med matrikkelreferanse
eller eksakt normalisert adresse. Rematchen oppretter, flytter eller fjerner bare
en grendekobling når offisielt adressepunkt og matrikkeldata gir et sikkert
resultat; uklare og overlappende treff beholdes for manuell kontroll. Et entydig kartobjekt åpner det samme
detaljpanelet med automatisk lagring som medlemsregisteret. Manglende hjemmelshaver
eller flere mulige registerposter opplyses eksplisitt; løsningen velger aldri en
eier eller tomt på grunnlag av fuzzy treff. Nye tomter forsøkes koblet til én
kontrollert grend server-side, men uklar geometri blokkerer ikke opprettelsen.

Forsidens kart bruker bare kontrollerte grendepolygoner. Eiendommer lastes når
brukeren velger en grend, og tabellen under kartet viser H-nummer,
gårds-/bruksnummer og adresse. Offentlig kartvisning er bevisst adskilt fra
medlemsdata og viser aldri navn, e-post, telefon, hjemmelshaver eller notater.
Forsiden viser Kartverkets åpne Topografisk Norgeskart WMS automatisk fra
zoomnivå 16. Administratorkartet har en valgfri **Bygninger**-bryter. Laget
endrer ikke kartets klikk-, polygon- eller registerfunksjoner.
Detaljert kildebruk, koordinatsystemer, avgrensninger og lisenskrav står i
[kartveiledningen](docs/map-explorer.md).

## Grupper og nyhetsbrev

`/admin/members/groups` administrerer både geografiske grender og e-postgrupper.
Administrator kan søke og velge enkeltposter eller hele det serverfiltrerte
utvalget. En gruppe inneholder medlemstilknytninger; den er ikke en kopiert
kontaktliste. Sletting av en gruppe må bekreftes og sletter ikke medlemmer.

Nyhetsbrev ligger som en egen modul på `/admin/members/newsletters`. Et utkast
har emne, sanert riktekst og ett eller flere gruppeutvalg. Forhåndsvisning teller
dedupliserte hovedadresser, testmail sendes separat, og masseutsending krever
`MAILERSEND_BULK_ENABLED=true` og eksplisitt bekreftelse. Medlemsstatus,
suppression og gyldig mottaker kontrolleres igjen rett før sending. Jobben kan
gjenopptas idempotent uten å sende ferdigbehandlede leveringer på nytt.

## Produksjonssetting: Netlify + Neon + Microsoft Entra ID

Kartmodulen ligger på `/admin/map`, med beskyttede Node-ruter
`POST /api/admin/map/search`, `GET/POST /api/admin/map/hamlets` og
`GET /api/admin/members/[id]`. De bruker eksisterende `members`-rettighet og
pooled databaseforbindelse. Automatisk rematch bruker
`hamlet-member-sync-background` og den server-side variabelen
`HAMLET_JOB_SECRET`; ingen ny Entra-rolle eller databasemigrering trengs. Den additive produksjonsmigreringen 16. september
la til `polygon`, `polygon_reviewed`, `polygon_version`, `polygon_updated_at` og
versjoneringstriggeren på `member_hamlets`; se
[migreringsstatus](docs/database-migration-2026-09-16.md). Ingen grender eller
kartgrenser ble opprettet automatisk. Godkjent deploy og funksjonell
produksjonsverifikasjon gjenstår.
De 11 digitaliserte grendene er nå lagret som kontrollerte polygoner i databasen;
applikasjonen har ikke lenger en separat utkastkatalog.
Node må kunne nå `ws.geonorge.no` og `overpass-api.de` over HTTPS, og nettleseren
må kunne hente kartbilder fra `cache.kartverket.no` og det valgfrie, detaljerte
bygningslaget fra `wms.geonorge.no`. CSP tillater kun disse to eksterne
bildekildene. Sørg for passende delt/WAF-rate-limit på kartrutene ved
produksjonsbruk; den lokale 20/minutt-grensen er bare per-instans.
Se [kartmodulens datakilder, begrensninger og bruk](docs/map-explorer.md).

HTML-ruter rendres ved request-tid fordi den strenge CSP-en bruker en ny nonce
per request. Next.js kan ikke legge denne nonce-en på scripts i statisk eller
ISR-generert HTML. Offentlige databaseoppslag og karusellmetadata er fortsatt
cachet separat, og forsiden gjør ingen Auth.js-oppslag. Ikke gjør rotlayouten
statisk uten samtidig å erstatte nonce-policyen med en testet hash/SRI-løsning.

Forsiden viser kontrollerte grendepolygoner fra `member_hamlets`. Den offentlige
GET-ruten `/api/map/hamlets/[id]/properties` laster eiendommer først når en grend
velges. Ingen grend er valgt ved innlasting, og samme grendeknapp slår valget av
og på. Leaflet og Kartverket-fliser lastes først når kartseksjonen nærmer seg
synsfeltet. Bygningslaget er aktivert som standard og vises fra zoomnivå 16;
**Vis eiendommer** ligger under kartet og kan skjule/vise det automatisk lastede
laget. Kartet har fullskjermsknapp. Ved hover fremheves grend eller eiendom;
grendehover fremhever også riktig knapp, og tooltipen ligger forskjøvet til
siden. Ruten
bruker `members.hamlet_id` som autoritativ avgrensning. Kartverket
brukes bare til kartplassering av disse registerpostene, ikke til et nytt
grendeoppslag ved hver visning. Responsen inneholder bare H-nummer,
gårds-/bruksnummer, adresse og sikker offisiell adresse-/teiggeometri. Teigen
vises når matrikkelreferansen gir et entydig treff; ellers brukes adressepunktet.
Klikk i det aktive grendepolygonet beholder valgt grend og kartutsnitt.
Medlems-ID, navn,
hjemmelshaver, e-post, telefon og interne notater inngår ikke i responsen. Ruten har en lokal
rate-limit på 20 oppslag per minutt og trenger samme delte/WAF-beskyttelse som
de øvrige offentlige rutene i produksjon. Ingen ny miljøvariabel er nødvendig.

Alle nedtrekkslister bruker en felles, tastatur- og mobilvennlig komponent.
Register-, artikkel- og loggfiltre reagerer ved endring (tekst etter 300 ms),
uten en egen filterknapp. Kartets eiendomstooltip viser H-nummer, adresse og
gårds-/bruksnummer på tre rader. Se [ikonoversikten](docs/icons.md) for
plasseringen av de eksisterende SVG-ikonene og lenker til ikonkataloger.

Bildene lazy-loades som standard. `npm run images:carousel` lager de versjonerte
WebP-kildene i `public/carousel/optimized`; kjør kommandoen når kildebildene
endres. Det første synlige karusellbildet prioriteres fortsatt for å unngå tregere
førstegangsvisning; øvrige karusellbilder monteres først ved bildebytte.
Automatisk bytte er pauset som standard og kan startes av brukeren. Filnavn med
nullutfylling, eksempelvis `_tf001`, og `_tf000` støttes.

Forsidens CMS-oppslag og grendeliste mellomlagres i fem minutter og invalideres
ved redigering. Next.js-optimaliserte bilder mellomlagres i minst én uke, mens
de versjonerte karusellkildene har ett års immutable nettleser-cache;
offentlige CMS-filer bruker ETag slik at uendrede filer ikke lastes på nytt fra
objektlageret ved revalidering.

Eksisterende tomter kan fortsatt kontrolleres manuelt med en tørrkjøring:

```bash
APP_ENVIRONMENT=production npm run hamlets:assign
APP_ENVIRONMENT=production HAMLET_ASSIGNMENT_CONFIRMED=true npm run hamlets:assign -- --apply
```

Andre kommando er en produksjonsendring og skal bare kjøres etter eksplisitt
godkjenning. Den bruker direkte `DATABASE_URL_UNPOOLED`, avviser miljømismatch,
kontrollerer at polygonversjonene er uendret, lagrer bare entydige MATCH-treff i
én SQL-operasjon og skriver audit-hendelser. Dette er et vedlikeholdsverktøy;
normal drift bruker automatisk full rematch hver gang et polygon lagres som
kontrollert. Jobben avviser ufullstendige Kartverket-data og utdaterte
polygonversjoner. Den flytter sikre treff og fjerner bare en kobling når et
eksakt offisielt adressepunkt beviser at tomten ligger utenfor alle kontrollerte
grender. Tvetydige eller uavklarte tomter beholdes for manuell kontroll.
Nye tomter forsøkes koblet både ved direkte adminoppretting og ved godkjenning
av en offentlig innmelding; medlemsfilter, grupper, detaljer og offentlig kart leser deretter
den lagrede `hamlet_id`-koblingen. Når en lagret grend velges i adminkartet,
avgrenses også registerlaget med denne koblingen; den tidligere manuelle
«Koble register til valgt grend»-handlingen er fjernet. Filteret **Uten grend**
i medlemsregisteret viser poster som må gjennomgås manuelt.

`netlify.toml` inneholder byggkommando, publiseringsmappe, Node-versjon og
funksjonsmappe. Netlify håndterer Next.js App Router gjennom sin Next.js-adapter,
mens den lange matrikkelsynkroniseringen kjøres som en Netlify Background
Function. Grenderematch og survey-utsendelser kjøres på samme måte i egne bakgrunnsfunksjoner.
Den planlagte Netlify-kjøringen av `background-watchdog` kontrollerer matrikkeljobber
hvert femte minutt, bare når Netlify `CONTEXT` og `APP_ENVIRONMENT` er
`production`. Den prøver høyst tre gjenopptakinger før synlig feilstatus.
På den første kalenderdagen i hver måned, beregnet i `Europe/Oslo`, oppretter
samme watchdog høyst én komplett matrikkelkontroll. En samtidig manuell kjøring
utsetter oppstarten til neste femminuttersintervall samme dag. Den månedlige
kontrollen endrer aldri medlemsregisteret automatisk: sikre endringer og usikre
treff legges til manuell vurdering, mens en kontroll uten avvik avsluttes uten å
opprette en oppgave. Fullførte kontroller med avvik og kontroller som feiler,
vises i oppgavelisten med lenke til det detaljerte resultatet.
Den bruker eksisterende `DATABASE_URL`, `MATRIKKEL_JOB_SECRET` og Netlifys `URL`.
Ingen ny produksjonsvariabel skal opprettes. Funksjonen kan ikke startes via
en offentlig URL; se [Netlify Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/).

Medlemsstatus og medlemskommentarer krever også den additive migreringen før
ny kode publiseres. Eksisterende tomter får `membership_status = 'member'`;
ingen unntak utledes fra navn. Kommentarer lagres separat fra interne adminnotater.
Samme migrering innfører grender/e-postgrupper, fler-tomtstilgang,
`cms_pages.body_rich_text`, nyhetsbrev og den lesbare hendelsesvisningen
`admin_activity_log`. Ingen medlemsdata flyttes til eksterne tjenester.

Reservasjon mot manuell deling med Turufjell AS bruker de additive kolonnene
`members.turufjell_as_sharing_opt_out` og
`members.turufjell_as_sharing_opt_out_updated_at`. Den avgrensede additive
produksjonsmigreringen ble utført og verifisert 16. september 2026; se
[migreringsstatus](docs/database-migration-2026-09-16.md). Eksisterende poster
har standardverdien `FALSE`. Endringer logges av den eksisterende
`members`-audittriggeren, og Excel-eksport utelater reserverte poster som standard.

Nye beskyttede ruter er `/admin/members/groups`, `/api/admin/member-groups`,
`/admin/members/newsletters` og `/api/admin/newsletters`, alle med eksisterende
`members`-rettighet. Nyhetsbrev bruker den nye `newsletter-background`-funksjonen
og eksisterende `MAILERSEND_JOB_SECRET`, `MAILERSEND_ENABLED`,
`MAILERSEND_BULK_ENABLED` og avsenderoppsett. Ingen nye miljøvariabler kreves.
Ingen reell utsending er utført under utviklingen. Utkast kan lagres uten å
aktivere masseutsending; faktisk køstart krever eksisterende bulk-bryter.
Ved lokal utvikling krever start av nyhetsbrev en konfigurert Netlify-funksjon;
appen starter ikke en langvarig reservejobb fra nettleseren.

Fler-tomtstilgang bruker hoved-e-post som eksisterende autorisasjonsgrense.
Ekstra kontaktadresser gir ikke utvidet selvbetjeningstilgang. Engangslenken
lagrer et serverbestemt tomteutvalg og normalisert hovedadresse, og kontrollerer
fortsatt e-posttilknytning/aktiv status ved hvert oppslag. Eldre økter uten utvalg
har fortsatt bare tilgang til den opprinnelige tomten. `?member=<id>` velger tomt
på profilsiden og egeneksport; ukjent/ikke tillatt ID gir ingen medlemsdata.
Egeneksport logges i `security_events` uten eksportinnhold.

CMS bevarer vanlig tekst i `body`, mens formatert innhold lagres i et sanert
JSON-tre. Gammel tekst tolkes aldri som HTML. Formateringen følger nettstedets
typografi. Se [Tiptaps Next.js-integrasjon](https://tiptap.dev/docs/editor/getting-started/install/nextjs).
Favicon leveres fra de offentlige metadata-rutene `/icon` og `/apple-icon`,
generert ved bygg fra eksisterende grafisk logo. Ingen nye miljøvariabler trengs.
Se også [Netlifys Next.js-veiledning](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
og [veiledningen for Background Functions](https://docs.netlify.com/build/functions/background-functions/).

Følg punktene i denne rekkefølgen ved første produksjonssetting. Bruk en konto
med tilgang til GitHub-repositoriet, Netlify-teamet, Neon-prosjektet og
appregistreringen i Microsoft Entra ID.

### 1. Kontroller kode og GitHub

1. Kontroller at siste commit ligger på `main` i `ibjohansen/tfv-poll`.
2. Åpne fanen **Actions** i GitHub og kontroller at arbeidsflyten
   **Code quality** er grønn for committen som skal publiseres.
   Kontroller at `quality` er påkrevd før innfletting til `main` og at direkte
   pushes ikke omgår kontrollen. En grønn Netlify-deploy alene bekrefter bare bygget.
3. Kjør den samme kontrollen lokalt dersom det er gjort endringer etter siste
   push:

```bash
npm ci
npm run check
git status --short
```

`git status --short` skal ikke vise ukjente endringer før produksjonssetting.

### 2. Kontroller Neon og databaseskjemaet

1. Kontroller at Neon CLI peker på prosjektets produksjonsgren:

```bash
neon status
neon config plan
```

2. Dersom planen viser at den private bøtten `cms-assets` mangler, kjør:

```bash
neon deploy
```

3. Kontroller at `.env.local` inneholder både pooled `DATABASE_URL` og direkte
   `DATABASE_URL_UNPOOLED` for den samme produksjonsgrenen. Ikke skriv ut eller
   lim forbindelsesstrengene inn i logger eller dokumentasjon.
4. Før produksjonsmigrering: verifiser endringen på en midlertidig schema-only-gren
   med syntetiske data, opprett et gyldig gjenopprettingspunkt og innhent eksplisitt
   godkjenning til å endre produksjonsdatabasen. Kontroller at ingen bakgrunnsjobber
   kjører. Ikke endre `.env.local` til testgrenen som del av denne kontrollen.
5. Kjør databaseskjemaet med den direkte forbindelsen når `database/schema.sql`
   er endret og produksjonskjøringen er godkjent:

```bash
APP_ENVIRONMENT=production npm run db:setup
```

Kommandoen er idempotent. Den kjørende Netlify-applikasjonen skal bruke pooled
`DATABASE_URL`; migrering og import skal bruke den direkte forbindelsen. Dette
følger [Neons anbefaling for pooling og migrering](https://neon.com/docs/connect/connection-pooling).

Kontroller etterpå at forventede kolonner, tabeller, indekser og triggere finnes,
og at eksisterende data er beholdt. Bruk radantall og kontrollsummer uten å
skrive medlemsopplysninger til logger eller eksportfiler. Se
[migreringsstatus 15. september 2026](docs/database-migration-2026-09-15.md),
[migreringsstatus 16. september 2026](docs/database-migration-2026-09-16.md),
[migreringsstatus 17. september 2026](docs/database-migration-2026-09-17.md) og
[migreringsstatus 19. september 2026](docs/database-migration-2026-09-19.md)
for utført testing, bekreftede produksjonsmigreringer og gjenopprettingspunkter.

For CMS-revisjoner skal den additive migreringen kjøres før kodeversjonen
publiseres. Kontroller spesielt `cms_page_revisions`, `cms_pages.version`,
`cms_pages.published_revision`, `cms_pages.image_decorative` og miniatyrkolonnene
på `cms_attachments`. `database/cms-improvement-rollback.sql` er kun til øvelse
på en kortlivet testgren før løsningen tas i bruk; den sletter historikk og skal
aldri kjøres i produksjon etter at redaktører har begynt å lagre revisjoner.
Gammel applikasjonskode tåler de additive kolonnene, så trygg rekkefølge er:
snapshot/gjenopprettingspunkt, skjema, verifikasjon, deretter Netlify-deploy.
Ved applikasjonsfeil beholdes skjemaet og forrige deploy reaktiveres.

Medlemssøket krever `pg_trgm`, den genererte kolonnen
`members.search_document` og den partielle GIN-indeksen
`members_search_document_trgm_idx`. Disse opprettes i riktig, idempotent
rekkefølge av `database/schema.sql`. Før applikasjonsversjonen publiseres skal
indeksen finnes og en personverntrygg `EXPLAIN (ANALYZE, BUFFERS)` på grenen
bekrefte bitmap-indekssøk. Produksjonsmigreringen krever fortsatt eksplisitt
godkjenning og direkte `DATABASE_URL_UNPOOLED`; denne kodeendringen kjører den
ikke automatisk.

Skjemaet oppretter også `audit_log` og triggere på `members`, `member_requests`,
`surveys`, `survey_responses`, `survey_attachments`, `cms_pages` og
`cms_attachments`. Loggen starter
når migreringen kjøres; den rekonstruerer ikke historikk fra tidligere
endringer. Tilgangstoken, verifiseringshash og interne lagringsnøkler utelates.

Skjemaet oppretter i tillegg `usage_daily_stats` og
`usage_web_vitals_daily` for egenhostet, anonym bruks- og ytelsesstatistikk.
Nettleseren køer sidevisninger og LCP/INP/CLS i inntil fem sekunder og sender
én liten batch med bare tillatt sidetype, målenavn/verdi/vurdering og grov
enhetskategori til `POST /api/usage/pageview`. En batch blir én databasespørring,
mot tidligere én databasespørring per sidevisning. API-et aksepterer bare
same-origin-kall, og senderen bruker `credentials: omit`. Det lagres aldri rå
URL eller query, IP-adresse, cookie, bruker-/besøks-ID, user-agent, referrer,
navigasjonsforløp, målings-ID eller enkeltstående hendelsestidspunkt. `Do Not Track` blir
respektert. Radene er dagsaggregater i norsk tid. Fordi de ikke inneholder
besøksidentifikatorer eller rå hendelser, beholdes aggregatene som historisk
statistikk uten automatisk sletting. En eventuell senere slettejobb skal være
en eksplisitt, dokumentert driftsbeslutning.

Administratorer med `audit`-rettighet kan se 7, 30, 90, 365 eller 730 dager,
eller hele perioden, på `/admin/usage`. Visningen inneholder en responsiv
Visx-graf med dag-, uke- eller månedsoppløsning, datatabell, tillatt sidetype og
grov enhetskategori. Den viser ikke «unike besøk», sesjoner eller varighet,
fordi slike tall ville krevd en varig identifikator og kunne blitt misvisende.
Ingen ny miljøvariabel er nødvendig. Migreringen ble kjørt og verifisert i
produksjon 16. september 2026. Applikasjonsversjonen ble publisert
17. september 2026, og produksjonsinnsamlingen er dermed aktivert.

Før publisering av worker-gjenopptaking må den additive migreringen kjøres:
den legger til manglende reservasjon-/forsøkskolonner på eksisterende
matrikkeltabeller. `audit_log` beskyttes mot UPDATE, DELETE og TRUNCATE;
`security_events` beskyttes også mot TRUNCATE. Dette erstatter ikke en separat
runtime-rolle uten skjemaeierskap: en skjemaeier kan deaktivere triggere.
Lagringstid og vedlikeholdsrolle må avklares før en separat, kontrollert
oppryddingsmigrering utformes; ingen logg slettes automatisk.

Sikkerhetsmigreringen er todelt. `db:setup` er additiv og kan kjøres før ny
kode deployes. Etter at ny surveyflyt er publisert og gamle lenker er erstattet,
fjernes klartekstkolonnene med:

```bash
APP_ENVIRONMENT=production SECURITY_CLEANUP_CONFIRMED=true npm run db:security-cleanup
```

Oppryddingen må ikke kjøres mens en eldre applikasjonsversjon fortsatt leser
`members.access_token`. Opprett restore-punkt og test begge steg på en
schema-only gren først.

### 3. Opprett og koble Netlify-prosjektet

1. Logg inn på Netlify og velg **Add new project → Import an existing project**.
2. Velg **GitHub**, godkjenn nødvendig repository-tilgang og velg
   `ibjohansen/tfv-poll`.
3. Bruk `main` som produksjonsgren.
4. Kontroller innstillingene som leses fra `netlify.toml`:

| Innstilling | Verdi |
| --- | --- |
| Base directory | tom / repositoryroten |
| Build command | `npm run build` |
| Publish directory | `.next` |
| Functions directory | `netlify/functions` |
| Node.js | `22` |

5. Opprett prosjektet. Netlify tildeler nå en adresse som
   `https://<prosjektnavn>.netlify.app`.
6. Hvis et eget domene skal brukes med en gang, legg det til under
   **Domain management → Production domains** før autentisering konfigureres.
7. Bruk `https://medlemsservice.turufjellvel.no` som kanonisk
   produksjonsadresse, uten avsluttende `/`, i både `AUTH_URL` og Entra-oppsettet.

Netlify beskriver den samme Git-flyten i
[Import an existing project](https://docs.netlify.com/manage/projects/add-new-project/#bring-existing-code-to-netlify).

### 4. Legg inn miljøvariabler i Netlify

Åpne **Project configuration → Environment variables** og legg inn variablene
enkeltvis. Velg produksjonskonteksten og scopes som gjør dem tilgjengelige for
både build og Functions.

Merk bare faktiske credentials og hemmeligheter som **Contains secret values**.
`AUTH_URL`, `API_MATRIKKEL_BASE_URL`, `MATRIKKEL_SYNC_EMAILS` og
`NEON_STORAGE_REGION` er offentlig konfigurasjon og skal ikke merkes som
hemmelige. Verdiene finnes med hensikt i dokumentasjon og tester.

Ikke bruk `netlify env:import .env.local`. Den lokale filen inneholder verdier
som ikke skal inn i produksjonsmiljøet, blant annet direkte databaseforbindelse,
lokal `AUTH_URL` og eventuell mock-konfigurasjon. Netlify leser heller ikke den
lokale `.env`-filen automatisk under skybygget; se
[Netlify environment variables](https://docs.netlify.com/build/configure-builds/environment-variables/).

#### Påkrevd for database og CMS

| Variabel | Produksjonsverdi |
| --- | --- |
| `DATABASE_URL` | Pooled Neon-forbindelse for produksjonsgrenen |
| `APP_ENVIRONMENT` | `production` |
| `TOKEN_AUDIENCE` | Unik, ikke-hemmelig verdi for produksjonsappen, for eksempel `tfv-production` |
| `SECURITY_EVENT_HMAC_KEY` | Unik tilfeldig produksjonshemmelighet på minst 32 bytes |
| `NEON_STORAGE_ACCESS_KEY_ID` | Verdien fra lokal `AWS_ACCESS_KEY_ID` |
| `NEON_STORAGE_SECRET_ACCESS_KEY` | Verdien fra lokal `AWS_SECRET_ACCESS_KEY` |
| `NEON_STORAGE_ENDPOINT` | Verdien fra lokal `AWS_ENDPOINT_URL_S3` |
| `NEON_STORAGE_REGION` | Verdien fra lokal `AWS_REGION`, for eksempel `eu-central-1` |

Ikke opprett `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` eller `AWS_REGION` i
Netlify. Navnene er reservert av plattformen. Variabelen
`AWS_SECRET_ACCESS_KEY_ID` finnes heller ikke; Neons opprinnelige navn er
`AWS_SECRET_ACCESS_KEY`. Applikasjonen foretrekker `NEON_STORAGE_*` og bruker
Neons opprinnelige `AWS_*`-variabler som fallback ved lokal utvikling.

#### Påkrevd for Microsoft-innlogging

| Variabel | Produksjonsverdi |
| --- | --- |
| `AUTH_SECRET` | Unik produksjonshemmelighet på minst 32 bytes |
| `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` | Directory tenant ID |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Application client ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Verdien til client secret, ikke secret-ID-en |
| `AUTH_URL` | `https://medlemsservice.turufjellvel.no` |
| `ADMIN_EMAILS` | Obligatorisk, kontrollert liste over godkjente administratorer |
| `ADMIN_REQUIRED_ROLES` | Anbefalt: kommaseparerte Entra app-roller som skal godtas |

Lag en ny `AUTH_SECRET` for produksjon, for eksempel lokalt med:

```bash
openssl rand -base64 32
```

#### Påkrevd for matrikkelsynkronisering

| Variabel | Produksjonsverdi |
| --- | --- |
| `API_MATRIKKEL_BASE_URL` | `https://innsyn.matrikkel.no/matrikkelapi/wsapi/v1` (lesetrafikk) |
| `API_MATRIKKEL_USR` | Matrikkel-brukernavn |
| `API_MATRIKKEL_PWD` | Matrikkel-passord, skrevet normalt uten `\$`-escaping |
| `MATRIKKEL_SYNC_EMAILS` | Kommaseparert rolle-allowlist for godkjente driftskontoer |
| `MATRIKKEL_JOB_SECRET` | En annen unik hemmelighet på minst 32 bytes |

Generer `MATRIKKEL_JOB_SECRET` separat; ikke bruk samme verdi som `AUTH_SECRET`.
Den samme verdien må være tilgjengelig for både Next.js-ruten og
`matrikkel-sync-background` i produksjonens Functions-scope. Ingen ny
miljøvariabel eller databasemigrering trengs for oppstartsrettelsen.

#### Påkrevd for automatisk grendekobling

| Variabel | Produksjonsverdi |
| --- | --- |
| `HAMLET_JOB_SECRET` | Egen tilfeldig intern hemmelighet på minst 32 bytes |

Generer hemmeligheten separat fra `AUTH_SECRET`, `MATRIKKEL_JOB_SECRET` og
MailerSend-hemmelighetene. Den må være tilgjengelig for både Next.js-ruten og
`hamlet-member-sync-background` i produksjonens Functions-scope, uten
`NEXT_PUBLIC_`-prefiks. Funksjonen bruker eksisterende pooled `DATABASE_URL`;
ingen databasemigrering er nødvendig.

#### Påkrevd for MailerSend

| Variabel | Produksjonsverdi |
| --- | --- |
| `MAILERSEND_ENABLED` | `true` først etter at senderdomenet er verifisert; behold `false` under bootstrap |
| `MAILERSEND_BULK_ENABLED` | `false` inntil masseutsendelse er eksplisitt godkjent; testmail virker fortsatt |
| `MAILERSEND_API_TOKEN` | Begrenset API-token fra MailerSend, aldri et browser-token |
| `MAILERSEND_FROM_EMAIL` | En eksisterende avsender på `turufjellvel.no`, for eksempel `post@turufjellvel.no` |
| `MAILERSEND_FROM_NAME` | `Turufjell Vel` |
| `MAILERSEND_REPLY_TO_EMAIL` | En overvåket adresse som kan motta svar |
| `MAILERSEND_DOMAIN_ID` | Domain ID for det verifiserte `turufjellvel.no`-domenet |
| `MAILERSEND_WEBHOOK_SIGNING_SECRET` | Individuell Signing Secret fra den opprettede webhooken |
| `MAILERSEND_JOB_SECRET` | Egen tilfeldig intern hemmelighet på minst 32 bytes |

Legg variablene inn enkeltvis og bare i produksjonskonteksten. Generer
`MAILERSEND_JOB_SECRET` separat fra alle andre hemmeligheter. Ingen av disse
verdiene skal inn i `netlify.toml`, GitHub eller ha `NEXT_PUBLIC_`-prefiks.
Hemmeligheten må være tilgjengelig for **Functions**. Velg dette omfanget alene
der abonnementet støtter det. Dersom Netlify avviser dette med «Upgrade your
Netlify account to set specific scopes», må bredere omfang godkjennes før det
endres; behold uansett verdien kun i `production`. Kontroller etter lagring
at nøkkelen faktisk finnes i prosjektets produksjonskontekst, og deploy på nytt.
Et vellykket CLI-prosessavslutningssignal alene bekrefter ikke at variabelen ble
lagret; kontroller også API-status og metadata uten å vise hemmelighetens verdi.
API-tokenet må minst ha tillatelsene `email_full` og `suppressions_read`, og bør
begrenses til sending domain der MailerSend-kontoen tilbyr dette.

#### Valgfritt eller skal utelates

- `ADMIN_EMAILS` skal aldri utelates eller være tom. Manglende eller ugyldig
  allowlist stenger all administratortilgang.
- Utelat `DATABASE_URL_UNPOOLED`; den trengs ikke av applikasjonen i drift.
- Utelat `MOCK_DATA`, `MOCK_DATA_DIR` og `MATRIKKEL_ALLOW_PRODTEST`.
- Ikke opprett `URL`; Netlify setter denne systemvariabelen selv.
- Ingen hemmelig variabel skal ha `NEXT_PUBLIC_`-prefiks.

Netlifys secretskanning er fortsatt aktiv. `netlify.toml` unntar bare de fire
offentlige konfigurasjonsnøklene over fra eksakt verdisøk. Dette hindrer falske
positiver uten å slå av skanning av `DATABASE_URL`, passord, tilgangsnøkler,
`AUTH_SECRET`, Entra client secret, MailerSend-hemmeligheter eller interne
jobbhemmeligheter. Se
[Netlify Secrets Controller](https://docs.netlify.com/build/environment-variables/secrets-controller/#configure-secret-scanning).

### 5. Registrer callback-URL i Microsoft Entra ID

1. Åpne [Microsoft Entra admin center](https://entra.microsoft.com/).
2. Kontroller øverst til høyre at riktig tenant, **TURUFJELL VEL**, er valgt.
3. Velg **Entra ID → App registrations** i venstremenyen. Bruk søkefeltet
   øverst og søk etter `App registrations` dersom menyvalget ikke vises.
4. Velg **All applications**, og åpne appregistreringen som har samme
   **Application (client) ID** som
   `AUTH_MICROSOFT_ENTRA_ID_ID`.
5. Kontroller at **Supported account types** er satt til kontoer kun i Turufjell
   vels egen organisasjon (single tenant).
6. Gå til **Authentication → Platform configurations**.
7. Velg **Add a platform → Web**, eller legg URI-en til under eksisterende
   Web-plattform.
8. Registrer nøyaktig denne adressen:

```text
https://medlemsservice.turufjellvel.no/api/auth/callback/microsoft-entra-id
```

9. Velg **Configure/Save**. Ikke legg callbacken under plattformtypen SPA, og
   ikke aktiver implicit grant.
10. Kontroller under **Certificates & secrets** at client secret ikke er utløpt,
   og at verdien i Netlify er den faktiske secret-verdien.

Microsoft krever HTTPS for ordinære produksjons-callbacker og at redirect URI
er registrert for riktig plattform. Se
[Microsofts redirect URI-veiledning](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url).

Hvis produksjonsdomenet endres senere, må både `AUTH_URL` i Netlify og redirect
URI i Entra oppdateres. Utløs en ny deploy etter endringen.

### 6. Utløs produksjonsdeploy

1. Gå til **Project configuration → General → Powered by Netlify badge** og slå
   av merket. Netlify injiserer ellers `/.netlify/scripts/hud` etter at Next.js
   har generert HTML. Den strenge nonce-baserte CSP-en blokkerer med hensikt
   dette plattformtillegget; ikke løs det ved å tillate `unsafe-inline`.
2. Gå til **Deploys** i Netlify.
3. Velg **Trigger deploy → Deploy site**. Bruk **Clear cache and deploy site**
   hvis forrige bygg ble kjørt før miljøvariablene ble lagt inn.
4. Kontroller at byggeloggen avsluttes uten feil.
5. Kontroller at Next.js-funksjonene og
   `matrikkel-sync-background`, `hamlet-member-sync-background`, `survey-email-background`, `newsletter-background` og `background-watchdog` finnes i Netlifys
   funksjonsoversikt. Kontroller også at edge-funksjonen
   `public-member-rate-limit` er oppdaget og aktivert i deployloggen.
6. Kontroller at den publiserte deployen bruker committen som var godkjent i
   GitHub Actions.
7. Åpne forsiden og `/informasjonskapsler` i en ny nettleserøkt. Kontroller at
   CSP-headerens nonce finnes på alle script-elementer og at konsollen ikke har
   «violates Content Security Policy». Nettleserens melding om utsatt lasting av
   lazy-loadede bilder er informativ og er ikke en CSP-feil.

Etter at GitHub-repositoriet er koblet til Netlify, utløser senere pushes til
`main` normalt en ny produksjonsdeploy.

Ved en uttrykkelig godkjent manuell CLI-deploy kan `netlify deploy --prod
--build` brukes fra en kontrollert arbeidskopi etter `npm run check`. Netlify
setter da `NETLIFY_LOCAL=true` og holder Functions-avgrensede hemmeligheter
utenfor den lokale byggeprosessen. Skybygg validerer fortsatt hele
produksjonskonfigurasjonen, mens API-ruter og bakgrunnsfunksjoner alltid
validerer nødvendige hemmeligheter på nytt ved kjøring. Ikke legg inn
midlertidige produksjonshemmeligheter i `.env.local`, `netlify.toml` eller
kommandolinjen for å få et lokalt bygg til å passere.
Bruk en ren byggmappe uten `.env`/`.env.*` ved manuell CLI-deploy: Next.js-
adapteren kopierer disse filene til serverfunksjonen hvis de finnes, også når
de er gitignored. Vanlige `included_files`-unntak overstyrer ikke adapterens
egen pakkemanifest. Kontroller at slike filer ikke finnes i den ferdige
`___netlify-server-handler.zip` før publisering. Produksjon skal hente
hemmeligheter fra Netlify, ikke fra en medpakket utviklerfil.

Kjør bygg og publisering i **samme** `netlify deploy --prod --build`-kommando.
Ikke erstatt denne med `netlify build` fulgt av `netlify deploy --no-build`
mot `.next`: Next-adapteren 5.16 flytter de statiske filene midlertidig inn i
publiseringsmappen under deploy og tilbake til `.netlify/static` etter bygg.
Den separate kommandoen kan derfor publisere feil mappe og gi 404 for alle
`/_next/static`-filer. Verifiser minst JavaScript, CSS og et offentlig bilde
fra den publiserte siden; HTTP 200 for HTML alene er ikke tilstrekkelig.
CLI 27.8 tillater heller ikke `--context` sammen med `--no-build`.

Rettelsesdeploy `6aabf888aceb2d217e4b3d77` ble publisert 17. september 2026
fra en slik ren byggmappe. Netlifys API bekreftet publisert `ready/production`,
og utsendelsespanelets publiserte JavaScript ble hash-verifisert mot bygget.
`MAILERSEND_JOB_SECRET` ble etter eksplisitt godkjenning opprettet som skjult
verdi med omfang `builds/functions/runtime`, kun i `production`. Alle seks
funksjonspakkene ble kontrollert uten lokale miljøfiler. Ingen reell utsendelse
ble startet; kontroll av innlogget knapp/API-status gjenstår. Kildeendringene
må fortsatt committes og pushes før en senere Git-basert deploy skal inkludere
rettelsen.

### 7. Verifiser produksjonen

**Nye svaralternativer og mottakerregler er migrert og publisert i produksjon
17. september 2026 etter eksplisitt godkjenning.** Se
[produksjonsrapporten](docs/database-release-survey-options-2026-09-17.md) og
[migrerings- og testprosedyren](docs/survey-options-and-recipients.md).
Migreringen erstatter tre unike indekser og ble kjørt med koordinert
skrivesperre for svar/utsendelser, datakontroll og deploy av samme kode.
Den midlertidige sperren er fjernet. Innlogget funksjonskontroll og ekte
kvitteringslevering med godkjente testmottakere gjenstår.
57 integrasjonstester, samtidige svar og gjentatt migrering bestod 17. september
med syntetiske data; [testrapport](docs/database-test-survey-options-2026-09-17.md).
Kjør testene igjen dersom kode/skjema endres. Ingen nye produksjonsmiljøvariabler
eller funksjonsnavn innføres.
Den eksisterende `survey-email-background` behandler også kvitteringsutboksen;
`background-watchdog` gjenopptar ventende kvitteringer hvert femte minutt og
kontrollerer `context.deploy.context` i stedet for byggvariabelen `CONTEXT`.
Verifiser begge med godkjente testmottakere, inkludert hoved-e-postkvittering ved
et senere, ikke tellende svar. Kontroller at invitasjonen bare viser mottakere
på samme tomt, og at tillegg av mottakere ikke sender tidligere invitasjoner på nytt.

Utfør kontrollene i denne rekkefølgen:

- Åpne **Undersøkelser → Utsendelse** innlogget. Kontroller at en ventende eller
  feilet kampanje viser **Start bakgrunnsjobben på nytt**, og at knappen er aktiv
  når API-oversikten har `background_status: "ready"`, e-post er konfigurert,
  masseutsendelse er aktivert og undersøkelsen er åpen innenfor svarfristen.
  En deaktivert knapp skal ha en synlig årsaksforklaring. Ikke trykk start som
  en teknisk røykprøve: det sender reelle e-poster. HTTP 202 fra bakgrunnsruten
  beviser bare mottatt invokasjon, ikke at hemmeligheten ble godtatt eller at
  en kampanje ble behandlet.
- Åpne `/` og kontroller toppbilde, publiserte artikler og artikkelpanelet.
- Åpne `/admin/web` og kontroller søk, status/kategori/sortering og direkte URL
  til editoren. Lagre to revisjoner, verifiser at en upublisert kladd ikke endrer
  offentlig side, fremprovoser en konflikt i to faner og gjenopprett en eldre
  revisjon. Kjør kvalitetskontrollen, last opp flere filer, prøv retry og gjenbruk
  fra mediebiblioteket. Kontroller mobilbredde 320 px, tastaturflyt, forhåndsvisning
  i tre bredder og at arkivert side gir 404 offentlig. Uten adminøkt skal
  `/admin/web`, editor, media- og revisjons-API svare med innlogging/401.
- Kontroller favicon i lys/mørk nettleserflate, og at `/icon` og `/apple-icon`
  gir PNG uten innlogging. Kontroller også i Safari/Firefox før endelig godkjenning.
- Med syntetisk testtomt: bytt mellom ordinært medlem og unntak, kontroller
  registerfilter/antall/eksport og at en unntatt tomt ikke kan motta eller besvare
  en medlemsundersøkelse. Ingen ekte tomter skal brukes til denne testen.
- Send en valgfri kommentar med retting/eierskifte fra et testmedlem. Kontroller
  ren tekst i oppgaveliste, medlemshistorikk og brukerlogg; kvitter lest og bekreft
  at historikken beholdes. Test delte hoved-/ekstraadresser på separate tomter.
- Kontroller at **Mine medlemsopplysninger** alltid vises før artiklene. Be om
  lenke med en kontrollert testbruker via H-nummer, adresse og e-post. Bekreft
  at treff og ikke-treff gir identisk HTTP-status, responsstruktur og tekst,
  uten H-nummer, adresse, maskert e-post eller annen medlemsinformasjon.
- Åpne tilgangslenken og kontroller at URL-en straks renses, at tilgangen utløper
  etter 45 minutters inaktivitet, at H-nummer/adresse/hjemmelshaver er
  skrivebeskyttet, og at hoved-e-post bare kan endres etter bekreftelse via
  både gammel og ny adresse.
- Kontroller at forsidebildet viser et bredere utsnitt med fokus forskjøvet mot
  venstre, og at loginbildet viser et vesentlig bredere utsnitt uten å miste
  fokuspunktet.
- Åpne `/admin` i et privat vindu og kontroller at du sendes til innlogging.
- Åpne forsiden og en publisert artikkel uten `Do Not Track`, og kontroller at
  `POST /api/usage/pageview` svarer `204` uten cookies eller rå URL i body.
  Åpne `/admin/usage` med en konto som har `audit`-rettighet og kontroller
  dags-, side- og enhetsfordeling. Kontroller at en konto uten rettigheten
  avvises, at admin- og API-sider ikke telles, og at aktivert `Do Not Track`
  hindrer kallet. Ikke bruk personlige medlems- eller surveylenker i testen.
- Åpne `/admin/map` med medlemsadministrator. Tegn, rediger og slett et lite
  polygon ved Turufjell; kontroller areal, bakgrunnskart, adressepunkter, veier,
  lagvalg, tabellsøk og zoom fra tabellrad, også på mobil og med tastatur.
  Hent eiendomsgrenser fra åpen Kartverket-WFS: kontroller teiger med og uten
  adresse, alle matrikkelreferanser, nøyaktighetsklasse og kilde. Et avkortet
  eller endret uttrekk skal avvises. Teiggrenser er ikke grensepåvisning.
  Kontroller at redigering/sletting fjerner gamle resultater, også under lasting.
- Kontroller at alle `/api/admin/map/*`-rutene, inkludert både GET og POST for
  `/api/admin/map/hamlets`, svarer 401 uten sesjon og 403
  med rolle uten `members`-rettighet. Test feil fra ekstern karttjeneste og
  retry i isolert miljø. Kontroller at ufullstendige adressedata ikke gir en
  sammenligningsrapport med falske «mangler»-tall.
- Åpne forsiden uten innlogging. Kontroller at alle kontrollerte grender har én
  knapp, at valg zoomer til riktig polygon og automatisk laster bare valgt grend.
  Kontroller at hover fremhever kartobjekt og riktig grendeknapp, og at
  **Vis eiendommer** skjuler/viser laget. Nettverksresponsen skal bare inneholde H-nummer, gårds-/bruksnummer,
  adresse, sikker adresse-/teiggeometri og kilde – aldri medlems-ID, navn eller
  kontaktfelt. Klikk i valgt grend skal ikke velge den bort. Kontroller at sikre
  matrikkeltreff tegnes som teigpolygon, med adressepunkt som reserve.
- Kontroller registersammenligningen med kjent testgrunnlag, inkludert ulike
  gnr/bnr på samme adresse, seksjonsnummer og flere kandidater. Ukjent plassering
  skal vises separat og ikke telle som manglende kartdata. Knyttede teiger kan
  berøre polygonet uten at adressepunktet er kjent; dette merkes uttrykkelig.
  Hent sammenligningen på nytt etter grensehenting. Registeret skal aldri endres.
- Velg adresser og teiger med og uten registertreff. Et entydig treff skal åpne
  samme medlemsdetaljer som medlemsregisteret; manglende hjemmelshaver skal
  opplyses tydelig, og flere mulige registerposter skal ikke kobles automatisk.
- Opprett en syntetisk tomt med en eksakt adresse innenfor én kontrollert grend.
  Kontroller at grenden tilordnes automatisk. Utilgjengelig adressetjeneste,
  fuzzy treff eller overlappende grender skal ikke føre til en gjettet kobling.
- Flytt kanten på et kontrollert grendepolygon over et syntetisk adressepunkt,
  lagre og kontroller at grendekoblingen oppdateres uten å holde kartforespørselen
  åpen. Et nytt kontrollert polygon skal tilsvarende koble en tidligere ukoblet
  testtomt. Kontroller `Hamlet member sync started` og avslutning/feil i
  Netlify-loggen, samt det aggregerte resultatet i brukerloggen. Ufullstendige
  Kartverket-data eller en polygonversjon som endres under kjøringen skal ikke
  gi delvis rapportert suksess.
- Logg inn med en godkjent administratorkonto og kontroller modulene Medlemsregister,
  Oppgaveliste, Undersøkelser, Web og Brukerendringer. Velg et medlem med gateadresse, og kontroller
  at eiendomskartet er lukket under adressefeltet i detaljpanelet og kan åpnes.
  Kontroller at lukkeknappen forblir synlig når panelet rulles. Kontroller at
  H-nummer, adresse og de øvrige eiendomsfeltene ikke kan redigeres etter
  opprettelse. Aktiver filteret for mangelfull hovedkontakt eller hoved-e-post
  og kontroller at bare relevante medlemmer vises. Aktiver deretter filteret
  for registrert kommentar og kontroller at alle og bare kommenterte medlemmer
  vises, også i kombinasjon med søk.
- Kryss av reservasjon mot deling med Turufjell AS i medlemmenes selvbetjening
  og kontroller automatisk lagring, endringstid og audit-historikk. Kontroller
  deretter adminfilteret og at Excel-eksporten utelater posten som standard.
  Slå bare av eksportvalget i en kontrollert intern test og slett testfilen.
- Gjør en kontrollert endring på et testmedlem. Åpne `/admin/audit`, kontroller
  riktig innlogget bruker, tidspunkt og før-/etterverdi, og bruk lenken tilbake
  til medlemsposten. Kontroller søk, filtrering på bruker, område, type og status,
  datointervall (begge datoer inkludert) og at side 2 vises når det er flere enn
  50 treff. Bekreft at
  tilgangstoken, verifiseringshash og lagringsnøkler ikke finnes i loggen.
- Send ett kontrollert eierskifte og én ny innmelding med testdata. Oppgi
  gårds-/bruksnummer og eventuelt seksjonsnummer. Kontroller at innmeldingen
  vises som ubekreftet i `/admin/inbox` før e-postlenken åpnes, og som bekreftet
  etterpå. Kontroller matrikkelopplysningene fra oppgavelisten. Bruk også en
  seksjonert testeiendom og kontroller at manglende eller ugyldig seksjonsnummer
  krever kontroll eller eksplisitt manuell bekreftelse før saken kan godkjennes.
  Fjern testdataene etterpå.
- Åpne en undersøkelse, kontroller kakediagrammene under **Resultater**, og last
  ned en Excel-eksport. Eksporter også et utvalg av testmedlemmer. Kontroller at
  begge eksporter vises i brukerloggen med riktig administrator og antall poster,
  uten eksportinnhold eller personlige lenker i logghendelsen.
- Åpne innstillingene for en syntetisk testundersøkelse, last opp et lite
  PDF-vedlegg og endre visningsnavnet. Kontroller at vedlegget kan åpnes med en
  personlig testlenke til akkurat denne undersøkelsen, men ikke med en økt for en
  annen undersøkelse eller uten gyldig tilgang. Fjern testvedlegget etterpå og
  kontroller at lagringsnøkkelen ikke vises i brukerloggen.
- I isolert testmiljø: åpne survey, endre spørsmålstekst i admin og send fra det
  gamle skjemaet. Kontroller 409 uten lagret svar, ny lasting med tomme svar og
  riktig versjon/tekst i snapshot etter ny innsending. Gamle åpne skjemaer uten
  `questionVersion` må lastes på nytt etter deploy.
- Velg **Utsendelse**, velg en syntetisk e-postgruppe og kontroller at alle
  mottakere vises med kontaktperson, hjemmelshaver og hoved-e-post. Send først en
  testmail til en eksplisitt testadresse og kontroller MailerSend-statusen. Start
  ikke masseutsendelsen før gruppen og domenekontrollen nedenfor er kontrollert.
- Opprett et CMS-utkast, last opp et lite testvedlegg, forhåndsvis, publiser og
  kontroller den offentlige visningen. Kontroller også at sideoversikten kan
  brukes uten horisontal rulling på mobil. Fjern testinnholdet etterpå.
- Generer eller bruk testlenken for eget medlem med H-nummer 25. Kontroller
  opplysningene uten å sende inn et svar dersom undersøkelsen er reell. Kontroller
  at eiendomskartet søker på gateadressen i Flå, starter med adresseinformasjonen
  minimert, og at **Åpne i Norgeskart** åpner kartet på Norgeskarts nettside.
- Kjør bare **Test H-nummer 25** i matrikkelmodulen. Kontroller logg og resultat
  før en full matrikkelkjøring startes. Test samtidig stopp og bakgrunnsarbeid
  i isolert testmiljø først; en stoppet kjøring skal beholde statusen etterpå.
- For matrikkeljobben: kontroller at funksjonskallet går direkte til
  `/.netlify/functions/matrikkel-sync-background`, uten `Location: /admin/login`.
  Bare de fire eksakte bakgrunnsrutene for matrikkel, grendekobling, survey-e-post og nyhetsbrev skal omgå Next-innlogging; `/admin` og
  `/api/admin/matrikkel/*` skal fortsatt kreve innlogging og riktig rolle.
  Jobbhemmeligheten kontrolleres inne i funksjonen før databasebehandling.
- Kontroller at `hamlet-member-sync-background` avviser feil metode, ugyldig
  grend-/versjons-ID og feil `HAMLET_JOB_SECRET`, og at bare direkte `202` godtas
  som oppstartskvittering. Bruk syntetiske tomter i isolert miljø; ikke flytt en
  reell grendegrense for å teste feilhåndtering.
- Kontroller tilsvarende at `survey-email-background` avviser feil
  jobbhemmelighet, at direkte `202` er eneste godkjente oppstartskvittering,
  og at redirect/HTML/timeout gir synlig feil for en fortsatt ventende kampanje.
  Ikke start masseutsendelse for å teste dette; bruk isolerte syntetiske tester.
- Kontroller at `background-watchdog` vises som **Scheduled**, med neste
  kjøring. Test aldri ved å forstyrre en ekte pågående produksjonsjobb.
  I isolert miljø: simuler akseptert jobb uten oppstart og utløpt reservasjon;
  bekreft gjenopptaking, maksimalt tre forsøk og ingen doble medlemsoppdateringer.
  Simuler også to samtidige kall den første i en måned: bare én månedskjøring
  skal opprettes, snapshotet skal omfatte alle aktive tomter, og foreslåtte
  endringer skal vises i oppgavelisten uten automatisk å endre medlemmet.
- Kontroller grender/e-postgrupper med syntetiske tomter: tilordning, flytting,
  filtrering, antall medlemmer og unike adresser. Sletting av en gruppe skal
  beholde medlemsdata og logges med administratorens identitet.
- I isolert testmiljø: lagre et navngitt polygon på `/admin/map`, last siden
  på nytt og kontroller at grenden finnes både i kartet og gruppeadministrasjonen.
  Test eksisterende grend uten polygon, navneendring, redigering, lagvalg og
  utkast/kontrollstatus. Valg i nedtrekkslisten skal laste og zoome til grenden
  direkte, uten en ekstra knapp. Kartet skal stå til høyre for grendeeditoren på
  større skjermer og under den på mobil. Geometriendring skal kreve ny manuell kontroll.
  To editorer skal ikke overskrive hverandre: siste lagring fra gammel versjon
  skal gi konflikt uten å miste utkastet. Navneendring/sletting fra
  gruppeadministrasjonen skal også avvise en gammel editor.
  Fjerning av lagret polygon skal beholde grend og medlemstilknytninger.
  Oppretting/endring/fjerning skal vises i brukerloggen uten koordinatlister
  eller kontaktdata.
- Test fler-tomtstilgang med to syntetiske tomter på samme hoved-e-post, én på en
  annen hovedadresse og én hvor adressen endres etter lenkeutstedelse. Bare det
  gyldige tilgangsutvalget skal vises, også ved manipulert `member`-parameter.
- Kontroller CMS-riktekst på mobil/desktop, lenker og tidligere artikler, uten
  HTML-tolkning av gammel tekst. Kontroller lagre-feil uten tap av editorinnhold.
- Nyhetsbrev: bruk bare godkjente testmottakere/grupper. Kontroller deduplisering
  på tvers av grupper, forhåndsvisning, testmail og faktisk fremdrift etter `202`.
  `newsletter-background` skal avvise feil hemmelighet/metode/ID. Ingen kampanje
  skal sendes om igjen ved gjenopptaking; usikre leveringer krever kontroll.
  Maksimalt 5000 unike adresser per kampanje. Statuslisten viser inntil 250 siste
  leveringer; samlet telling beregnes fra alle. Ved worker-krasj kan administrator
  gjenoppta etter at 16-minuttersreservasjonen er utløpt. Watchdog dekker foreløpig
  bare Matrikkel. Mottakerreservasjoner og gjeldende medlemsstatus kontrolleres før sending.
- Brukerloggen skal vise e-postlivsløp med stabil hendelses-ID, uten mottakerliste
  eller meldingstekst. Gamle testmailer uten aktør merkes `unknown`, ikke gjettet bruker.
- Stopp/godkjenning/skjuling i matrikkelmodulen skal logges med innlogget
  aktør. Skjuling av kjøringen skal ikke fjerne handlingen fra brukerloggen.
- Kontroller at et godkjent oppstartskall mottar `202`, og deretter at
  `started_at` og behandlede poster faktisk oppdateres. I Netlify-funksjonsloggen
  skal `Matrikkel background processing started` og en avslutning/feil vises.
  `202` er bare kvittering for mottatt oppdrag, ikke en fullført tilgangskontroll
  eller bekreftelse på startet behandling.
- I isolert miljø: simuler `200` med innloggings-HTML, `307`, timeout og manglende
  jobbhemmelighet. API-et skal svare `503` med tydelig melding, og en fortsatt
  ventende kjøring skal få `failed` uten endrede medlemmer eller slettet snapshot.
  En allerede startet/stoppet kjøring skal ikke overskrives. Feilen skal vises
  også etter ny sidevisning; nettleseren skal ikke starte reservebehandling.
- Kontroller at `/api/admin/surveys` returnerer `401` uten innlogget sesjon.
- Kontroller at `/api/admin/member-requests/<id>` returnerer `401` uten
  innlogget sesjon, og at `/mine-opplysninger` ikke viser data uten gyldig cookie.
- Kontroller Netlify Functions-loggene for feil og verifiser at ingen
  hemmeligheter skrives til logg.

### 8. Tilbakerulling og etterarbeid

- Ved feil i applikasjonen: åpne **Deploys** i Netlify og publiser siste kjente
  fungerende deploy på nytt.
- Ikke reverser databaseskjemaet automatisk. Migreringen for flere mottakere
  erstatter unike indekser og er **ikke bare additiv**. En gammel deploy er ikke
  kompatibel med det nye svarskjemaet. Planlegg koordinert tilbakeføring og
  bevar alle innsendte svar; se den særskilte migreringsprosedyren.
- Behold tidligere Entra redirect URI til den nye innloggingen er verifisert.
- Registrer eier og utløpsdato for Entra client secret, Matrikkel-legitimasjonen
  og interne hemmeligheter, slik at de kan roteres før utløp.
- Oppbevar medlems- og resultat-eksporter sikkert og slett lokale kopier når de
  ikke lenger er nødvendige.

Hemmeligheter skal bare administreres i Neon, Netlify og Microsoft Entra ID,
aldri i GitHub-filer eller dokumentasjon.

## Se svar i Neon

I Neon SQL Editor kan du for eksempel kjøre:

```sql
SELECT *
FROM survey_responses
ORDER BY created_at DESC;
```

En enkel opptelling:

```sql
SELECT answers->>'q1' AS svar, COUNT(*) AS antall
FROM survey_responses
WHERE survey_id = '616fd7e9e244b6f4947eb1822dbd01ad'
GROUP BY answers->>'q1'
ORDER BY antall DESC;
```

## Medlemsregister og personlige lenker

Kjør hele `database/schema.sql` i Neon SQL Editor før den nye versjonen tas i bruk.
Skriptet kan kjøres på en eksisterende database: gamle anonyme svar beholdes med
`NULL` i `member_id` og `survey_id`. Disse teller ikke som medlemsbesvarelser.

Tabellen `members` har et internt løpenummer (`id`), men ingen global
surveyhemmelighet. Hver invitasjon oppretter i stedet en tilfeldig 256-bits
kode for nøyaktig én tomt, én undersøkelse og én mottakeradresse. Bare SHA-256-hashen
lagres i `survey_access_tokens`; koden er miljø- og audience-bundet og utveksles
umiddelbart mot en separat, kortlivet surveyøkt. Invitasjonslenken kan åpnes på
nytt dersom økten utløper, men slutter å virke etter svar, eksplisitt
tilbakekalling, endret mottakerbinding eller kodens utløp.

Etter overgang fra den gamle tokenmodellen kan en fullført kampanje arkiveres
fra e-postpanelet med **Send nye sikre lenker**. Handlingen krever eksplisitt
bekreftelse og oppretter en ny kampanje; tidligere leveringshistorikk beholdes.
Kjør først deretter `db:security-cleanup` for å gjøre gamle globale lenker
permanent ugyldige på databasenivå.

Startundersøkelsen i `data/survey.js` seedes til `surveys` ved databaseoppsett.
Nye undersøkelser opprettes og redigeres i administrasjonen. Hver får en
obligatorisk sluttdato og er tilgjengelig ut denne datoen i norsk tid, samt en
tilfeldig 32-tegns hex-ID. Etter sluttdatoen viser medlemslenken at undersøkelsen
er avsluttet og API-et avviser nye svar. Svar lagres som et JSON-objekt med spørsmåls-ID-er
og `surveyVersion`; versjonen økes automatisk når spørsmålene endres. Hver
besvarelse beholder også et snapshot av spørsmålstekstene som var aktive ved
innsending. Eldre svar får beste tilgjengelige snapshot ved migreringen, siden
tidligere spørsmålstekster ikke kan rekonstrueres. Standardalternativene er
Ja/Nei/Vet ikke (lagrede ID-er `ja`, `nei`, `usikker`). Administrator kan i stedet
lage 2–20 egne alternativer og velge enkeltvalg eller flervalg per spørsmål.
ID-er, tekster og valgtype lagres i snapshotet; flervalg lagres som en liste.
Kopiering gir en ny, stengt undersøkelse uten svar eller utsendelser, med egne
kopier av vedlegg. Artikler kopieres til upubliserte utkast med egne filkopier,
og nyhetsbrev til nye, usendte utkast.

Administrator kan laste opp vedlegg direkte på en lagret undersøkelse.
`survey_attachments` knytter metadata til undersøkelsen, mens filen ligger i
privat Object Storage. Vedleggene vises bare når mottakeren har en gyldig økt
for samme undersøkelse. Produksjonsmigreringen ble utført og verifisert
17. september 2026. Kjør `npm run db:setup` med direkte databaseforbindelse før
funksjonen tas i bruk i andre miljøer som mangler tabellen.

Klikk på en undersøkelse i `/admin/surveys` og velg fanen **Resultater** for å
se svarfordeling per spørsmål som kakediagram (enkeltvalg), eller søyler
(flervalg), antall og prosent. Flervalgsprosenter kan summere til over 100 %. Dersom
spørsmålene har blitt endret, vises resultatene separat per spørsmålsversjon.
Excel-eksporten inneholder både en aggregert oppsummering og et detaljark med
én rad per spørsmål og besvarelse. Resultater og eksport er tilgjengelige både
mens undersøkelsen er åpen og etter at sluttdatoen er passert.

Manglende, ugyldig, tilbakekalt eller utløpt invitasjonskode og allerede
innsendt svar vises med en generell tilgangsmelding. Ved databasefeil vises en melding om at
registeret er utilgjengelig. Skjemaet er bare tilgjengelig med gyldig surveyøkt.
API-et validerer samme tilgang på nytt. En unik databaseindeks på
`(member_id, survey_id, response_key)` hindrer også dobbeltsvar ved samtidige
innsendinger. Standard er første svar per tomt; uten denne begrensningen teller
hvert invitert e-postsvar selvstendig. Senere forsøk i tomtemodus lagres bare i
kvitteringsutboksen, aldri over det tellende svaret. Hoved-e-post får kvittering
med tellende svar, avsender og eventuelt det senere forsøket.
Endepunktet har i tillegg en enkel per-instans rategrense og origin-kontroll.
Delt Netlify- og Postgres-rategrense beskytter verifikasjon og innsending.

Engangskoden gir rett til å opprette en økt for den aktuelle tomten og
undersøkelsen. Utløpet er senest undersøkelsens sluttdato og aldri mer enn 14
dager. Etter utveksling fjernes koden fra adresselinjen. Surveyen får bare
H-nummer, matrikkel-/seksjonsnummer og adresse; kontaktperson, e-poster,
hjemmelshaver og tinglysningsdato returneres ikke. Tilgangen markeres ferdig i
samme transaksjon som svaret lagres. Svar er fortsatt koblet til tomten og er
ikke anonyme.

### Mine medlemsopplysninger, eierskifte og innmelding

Forsiden viser alltid **Mine medlemsopplysninger** før artiklene. En registrert
bruker oppgir H-nummer, nøyaktig gateadresse, hoved-e-post eller en registrert
alternativ e-post og ber om en lenke. H-nummeroppslaget ignorerer store/små
bokstaver samt mellomrom eller bindestrek mellom `H` og tallet; eksempelvis
`H25`, `H-25`, `h25`, `h-25`, `H  25` og `25` behandles likt. Oppslaget skjer
bare på serveren. Offentlig respons er alltid den samme, uansett treff,
ikke-treff, manglende e-post eller nylig utsendelse. Den avslører aldri `found`,
H-nummer, adresse eller maskert e-post. Edge- og Postgres-baserte grenser bruker
plattformverifisert klient-IP, HMAC av oppslaget, nettleserindikator og samlet
systemgrense.

Tilgangslenken inneholder en kryptografisk tilfeldig engangskode på 32 bytes og
varer i 15 minutter. Bare SHA-256-hashen lagres i `member_access_tokens`. Ved
åpning konsumeres den atomisk og byttes mot en separat, tilfeldig og hashet
medlemssesjon med 45 minutters inaktivitetsgrense og absolutt makstid. Bare
sesjonshemmeligheten legges i en `__Host-`, `HttpOnly`, `Secure`,
`SameSite=Lax`-cookie i produksjon; URL-koden brukes aldri som cookie.

Medlemmet kan se registrerte eiendoms- og kontaktopplysninger,
undersøkelsessvar med spørsmålssnapshot, registrert e-postleveringshistorikk og
egne medlemsforespørsler. Interne administratornotater returneres ikke og er
ikke med i JSON-eksporten. `primary_contact_name` og `other_contact_emails` kan
endres direkte. Medlemmet kan også reservere tomten mot manuell deling med
Turufjell AS. Dette er en eksplisitt reservasjon, ikke en automatisk vurdering
basert på eiernavn eller medlemsstatus. Endring av hoved-e-post krever en separat engangsbekreftelse
først via gammel og deretter ny adresse; fullføring tilbakekaller alle tidligere
medlem- og surveyøkter. H-nummer, gårds-/bruksnummer, gateadresse, hjemmelshaver og
tinglysningsdato er skrivebeskyttet. De samme eiendomsfeltene er også
skrivebeskyttet etter opprettelse i adminpanelets medlemsdetaljer.

Administrator kan se og filtrere på delingsreservasjonen i medlemsregisteret.
Excel-eksport utelater reserverte poster som standard; administrator må velge
eksplisitt dersom de skal være med i et annet legitimt arbeidsutvalg. Feltet er
`FALSE` for eksisterende poster etter migrering, og endringstidspunktet oppdateres
bare når reservasjonsverdien faktisk endres. Reservasjonen påvirker ikke
medlemskap, innlogging, undersøkelser eller nyhetsbrev uten en egen senere
produktbeslutning.

**Meld eierskifte** oppretter en merket, ventende forespørsel med ny
kontaktperson, hoved-e-post og alternative adresser. Feltverdiene erstattes
først når en innlogget administrator godkjenner saken; offisielle eiendomsfelt
endres aldri av godkjenningen. Godkjenningen tilbakekaller samtidig alle aktive
selvbetjeningslenker for den tidligere eieren. **Meld inn ny tomt** kan brukes når minst
H-nummer eller gateadresse ikke finnes. Skjemaet tar også imot gårds-/bruksnummer
og valgfritt seksjonsnummer. Saken vises umiddelbart i oppgavelisten som
ubekreftet. Oppgitt e-post kan bekreftes med en egen 15-minutters lenke, og saken
merkes da som bekreftet. Godkjenning oppretter medlemmet så lenge H-nummer/adresse
fremdeles ikke kolliderer med et aktivt medlem. Ved opprettelse forsøker serveren
å knytte tomten til én kontrollert grend når Kartverket gir ett eksakt
adressepunkt innenfor ett polygon. Uklare treff, overlapp eller tjenestefeil gir
ingen gjettet grendetilknytning og blokkerer ikke opprettelsen.

Ventende saker vises i den separate oppgavelisten på `/admin/inbox`. Saker med
status `pending_verification` merkes tydelig som ubekreftet, men administrator
kan velge å behandle dem manuelt. Ved innmelding sammenlignes gateadressen med
oppgitt gårds-/bruksnummer. Saksbehandler må deretter kontrollere matrikkelenheten
mot Matrikkel-API-et eller bekrefte den manuelt; seksjonerte eiendommer kan ikke
godkjennes før seksjonsnummeret er avklart. Godkjenning viser en ekstra
advarsel om at e-postbekreftelsen overstyres. Begge endepunktene kontrollerer Microsoft Entra-
administratortilgang server-side. Den offentlige funksjonen bekrefter aldri om
H-nummer, adresse eller e-post finnes. Oppslag og endringer har origin-kontroll,
Netlify edge-rategrense, delt Postgres-begrensning og duplikatbrems.

Databaseendringen er additiv og oppretter:

- `application_environment` for eksplisitt database-miljø
- `member_access_tokens` og `member_sessions` for engangskoder og hash-lagrede økter
- `member_email_changes` for totrinns bekreftelse av hoved-e-post
- `survey_access_tokens` og `survey_sessions` for avgrenset surveytilgang
- `security_rate_limits` og append-only `security_events` for misbruksvern og
  sikkerhetshendelser uten rå identifikatorer eller hemmeligheter
- `usage_daily_stats` for varig, dagsaggregert bruksstatistikk uten
  besøksidentifikatorer eller rå hendelser
- `member_requests` for status på e-postbekreftelse og manuell behandling av
  innmelding/eierskifte, inkludert gårds-/bruksnummer, seksjonsnummer og status
  for matrikkelkontroll
- `section_number` på `members` og `matrikkel_sync_backups`, slik at seksjonen
  følger medlemmet og kan bevares under matrikkelsynkronisering
- `member_profile_updates` for et minimalt revisjonsspor som bare lagrer navnene
  på kontaktfeltene som ble endret, ikke gamle eller nye verdier
- e-posttypene `member_access` og `membership_verification` i
  `email_deliveries`

Utløpte selvbetjeningstoken og ubekreftede innmeldinger eldre enn syv dager etter
utløp ryddes opportunistisk når samme type offentlig forespørsel brukes igjen.
Godkjente, avviste og verifiserte saker slettes ikke automatisk. Fastsett derfor
en dokumentert oppbevaringsfrist og eventuell planlagt slettejobb før produksjon.

`security_events` er bare for autorisert sikkerhetsoppfølging. Standard
oppbevaring er 12 måneder; sletting skal være en kontrollert, logget driftsjobb
utført av databaseeier. Tabellen kan ikke oppdateres eller slettes gjennom
applikasjonsrollen.

Selvbetjeningen støtter innsyn, retting og en maskinlesbar kopi, men er ikke i
seg selv en komplett implementasjon av alle personvernrettigheter. Forespørsler
om blant annet sletting, begrensning, dataportabilitet eller protest må fortsatt
sendes til `post@turufjellvel.no` og vurderes konkret. Dokumenter identitetskontroll,
behandlingsgrunnlag, frister og unntak i personvernrutinen. Se Datatilsynets
veiledning om [rett til innsyn](https://www.datatilsynet.no/rettigheter-og-plikter/den-registrertes-rettigheter/rett-til-innsyn/),
[retting og sletting](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/retting-og-sletting/)
og [dataportabilitet](https://www.datatilsynet.no/rettigheter-og-plikter/den-registrertes-rettigheter/rett-til-dataportabilitet/).

### CSV-import

Importen leser semikolonseparert UTF-8 CSV, inkludert BOM og tom rad før overskriftene.
Forhåndsvis først; `--apply` skriver alle godkjente rader i én transaksjon:

```bash
npm run db:setup
npm run members:import -- /sti/2026-aktiv.csv
npm run members:import -- /sti/2026-aktiv.csv --apply
```

Regler:

- Tomt H-nummer utelates. `N/A` beholdes som et midlertidig H-nummer.
- Rader uten `Matrikkel-GNR/BR` eller `Tomt/Adresse` utelates.
- Flere `N/A`-rader får ulike interne ID-er. Tilgangslenker opprettes bare ved
  en konkret utsendelse og importeres aldri.
- `Matrikkel-eier` og `Matrikkel-tinglyst dato` bevares som tekst, inkludert ` / `.
  Eiernavn vises på separate linjer i både skjema og admin.
- `Navn` ignoreres helt og er ikke påkrevd i CSV-en. Matrikkel-eier brukes alltid som kontaktnavn.
- `Kommentar` lagres som et internt adminnotat og returneres aldri i
  selvbetjening eller automatisk JSON-eksport.
- Gjentatt import oppdaterer medlemmer etter en intern `import_key` basert på
  matrikkelnummer og adresse. Interne ID-er beholdes også når
  `N/A` erstattes med et H-nummer. Dersom matrikkelnummer/adresse endres, må
  eksisterende medlemsidentitet avklares før import; kjente H-numre er unike.
- Dupliserte tomter eller kjente H-numre stopper importen. Ingen eksisterende
  medlemmer slettes fordi de mangler i en senere CSV-fil.

| CSV-kolonne | Databasekolonne |
| --- | --- |
| H-nummer | `h_number` |
| Matrikkel-GNR/BR | `cadastral_number` |
| Tomt/Adresse | `street_address` |
| Matrikkel-eier | `title_holder` |
| Matrikkel-tinglyst dato | `registration_date` (tekst) |
| Matrikkel-eier (også kontaktnavn) | `primary_contact_name` |
| Hoved-epost | `primary_contact_email` |
| Extra-epost | `other_contact_emails` (tekstliste) |
| Kommentar | `admin_comment` (kun admin) |

Konkrete importvolum og produksjonsstatus føres i intern driftsdokumentasjon.
Kilde-CSV og medlemsdata ligger ikke i Git eller `public`.

### Synkronisering med Kartverket

Brukere med matrikkelsynk-rollen får valget **Oppdater matrikkeldata** i
hamburgermenyen. Siden ligger på `/admin/members/matrikkel`. Rollen er adskilt
fra vanlig administratortilgang og konfigureres som en kommaseparert allowlist:

```env
MATRIKKEL_SYNC_EMAILS=<godkjent-driftskonto@turufjellvel.no>
```

Variabelen må settes eksplisitt. Dersom den mangler eller er tom, har ingen
brukere tilgang til matrikkelsynkronisering.

På Matrikkel-siden kan administratoren søke på H-nummer, gateadresse eller
gårds-/bruksnummer og velge ett konkret medlem. Utvalget låses til medlemmets
interne ID før snapshotet opprettes; andre rader med samme midlertidige H-nummer
blir derfor ikke berørt. Administratorer som både har medlems- og
matrikkelrettighet får også en direkte handling fra medlemsdetaljene. Valget
bruker samme backup, bakgrunnsjobb, avviksbehandling og brukerlogg som en full
kjøring og krever ingen ny tabell eller miljøvariabel.

Kartverkets produksjonslegitimasjon skal bare ligge i `.env.local` lokalt og i
Netlifys server-side miljøvariabler i produksjon:

```env
API_MATRIKKEL_BASE_URL=https://innsyn.matrikkel.no/matrikkelapi/wsapi/v1
API_MATRIKKEL_USR=<brukernavn>
API_MATRIKKEL_PWD=<passord>
MATRIKKEL_JOB_SECRET=<tilfeldig hemmelighet på minst 32 bytes>
```

I lokal `.env.local` må eventuelle `$`-tegn i `API_MATRIKKEL_PWD` escapes som `\$`.
Next.js ekspanderer ellers teksten etter dollartegnet som en miljøvariabel og
sender et endret passord. I Netlifys miljøvariabelgrensesnitt legges passordet
inn normalt, uten denne escapingen.

Ingen av variablene skal ha `NEXT_PUBLIC_`-prefiks. `MATRIKKEL_JOB_SECRET`
brukes bare til å autentisere den interne bakgrunnsjobben. Prodtest avvises som
standard; ved en bevisst lokal test kan `MATRIKKEL_ALLOW_PRODTEST=true` settes.
Integrasjonen gjør bare lesekall og bruker derfor Kartverkets dedikerte
`innsyn.matrikkel.no`-endepunkt. `registrering.matrikkel.no` skal ikke brukes
uten at løsningen senere får eksplisitte oppdateringskall mot Matrikkelen.

Oppstart og videreføring bruker `lib/matrikkel-background.js`: HTTPS, ingen
omdirigeringer, 10 sekunders timeout og bare HTTP `202` som gyldig kvittering.
Next-proxyens matcher unntar kun de eksplisitt navngitte bakgrunnsfunksjonene
(og eventuell avsluttende skråstrek) fra cookieinnlogging. Matrikkelfunksjonen krever fortsatt POST,
korrekt jobbhemmelighet og gyldig jobb-ID; admin-API-et beholder rollebeskyttelsen.
Dette unngår feilen der en omdirigering til innlogging ga HTML med `200` som
ble tolket som «jobb startet» uten at noen behandling skjedde.

Ved avvist/ubekreftet oppstart markeres bare en fortsatt ventende, ikke startet
kjøring som feilet. Snapshot beholdes og nye forsøk kan opprettes; en worker
som kommer senere, skal ikke behandle den feilmarkerte kjøringen. Dersom worker
allerede har startet, beholdes statusen. Nettleserbasert reservebehandling brukes
bare i utvikling, aldri ved produksjonsfeil. Jobbens videresending bruker samme
verifiserte oppstart mot gjeldende deploys origin.

Feilsøking: Ved tom funksjonslogg, kontroller rutingen før Matrikkel-API-et.
Oppstartsfeil logges som `Matrikkel background dispatch failed` i Next-funksjonen
med jobb-ID, feilkode og eventuell HTTP-status. Worker logger start, avslutning,
autentiseringsavvisning og videreføring uten medlemsdata eller hemmeligheter.
Netlify kan returnere `202` før worker avviser et kall; kontroller derfor alltid
lagret fremdrift og funksjonsloggen. Hvis en akseptert jobb aldri starter eller
worker blir avbrutt, bruk **Stopp kjøring** og undersøk årsaken før nytt forsøk.
`background-watchdog` kontrollerer i produksjonskontekst jobber som ikke har
startet og utløpte worker-reservasjoner hvert femte minutt. Den forsøker høyst
tre kontrollerte gjenopptakinger før kjøringen får synlig feilstatus. Dette må
likevel funksjonstestes etter deploy; en `202` bekrefter bare at Netlify tok imot
oppdraget, ikke at behandlingen faktisk startet.

Den samme planlagte funksjonen oppretter en idempotent full kontroll den første
i hver måned. `matrikkel_sync_runs.scheduled_month` har en unik indeks for
automatiske kjøringer, slik at overlappende scheduler-kall ikke kan opprette to
kontroller for samme måned. Kjøringen bruker et komplett snapshot, men er en ren
sammenligning: ingen medlemsfelter endres før et forslag godkjennes manuelt.
Avvik og feil telles som én oppgave per månedskjøring i `/admin/inbox`. Når alle
forslag er godkjent og det ikke finnes feil, forsvinner oppgaven automatisk;
en gjennomgått feilkjøring kan skjules fra Matrikkel-loggen.

Oppslaget bruker `street_address` som eneste søkenøkkel og kan bare skrive:

| Kartverket/verdi | Medlemsfelt |
| --- | --- |
| Gårds- og bruksnummer | `cadastral_number` |
| Seksjonsnummer | `section_number` |
| Aktive tinglyste eiere | `title_holder` |
| Eierforholdets `datoFra` | `registration_date` |

Før hver kjøring kopieres disse fire feltene for alle valgte aktive medlemmer til
`matrikkel_sync_backups` i samme transaksjon som jobbregistreringen. Dette er et
komplett tilbakerullingsgrunnlag for synkroniseringens endringer, men ikke en
ekstern katastrofesikker `pg_dump`. En full dump må lagres kryptert utenfor den
samme databasen og krever at et eget lagringsmål og en slettefrist velges.

Eksakte treff, inkludert entydige A5-avvik, oppdateres automatisk. Fuzzy-treff,
tvetydige treff og eiendommer uten aktiv tinglyst eier endrer ikke medlemmet.
De vises som avvik og må eventuelt godkjennes manuelt. Ved nettverks- eller
API-feil beholdes alle eksisterende medlemsverdier. Rå SOAP-responser,
fødselsnummer og interne person-ID-er lagres ikke.

Bruk **Test H-nummer 25** før første fullstendige kjøring. For ordinær
oppdatering av én rad brukes medlemsvelgeren. Begge bruker samme serverlogikk,
sikkerhetskopi og avviksbehandling, men medlemsvelgeren avgrenser alltid på
intern medlems-ID.

`registration_date` inneholder Matrikkelens `datoFra` for det aktive tinglyste
eierforholdet. Det er ikke nødvendigvis kontrakts-, overtakelses- eller faktisk
tinglysningsdato.

## MailerSend og survey-utsendelser

MailerSend brukes bare som transaksjonell leverandør. `members` i Neon er
fortsatt autoritativ kilde; applikasjonen oppretter ikke en medlemsdatabase eller
synkroniserer en kontaktliste hos MailerSend. E-post sendes fra Node-runtime over
[MailerSend Email API](https://developers.mailersend.com/api/v1/email). SDK er
ikke nødvendig for den lille API-flaten.

`lib/mailer-service.js` har den generiske `sendEmail`-funksjonen. Den validerer
konfigurasjon, mottaker, emne og innhold, lager plain-text når det trengs og
returnerer MailerSend message ID. Klikk-, åpne- og innholdssporing slås eksplisitt
av. Loggene inneholder bare type, interne medlem-/survey-ID-er, mottakerdomene,
message ID, tidspunkt og resultat – aldri API-token, komplett e-postinnhold eller
personlig survey-URL.

Den samme tjenesten leverer survey-invitasjoner, 15-minutters engangstilgang til **Mine
medlemsopplysninger** og e-postbekreftelse av nye innmeldinger. Selvbetjeningen
krever derfor fungerende MailerSend-konfigurasjon samt korrekt
`APP_ENVIRONMENT`, `TOKEN_AUDIENCE` og `SECURITY_EVENT_HMAC_KEY`. `members` er
fortsatt eneste autoritative medlemsregister.

### Lokal utvikling og testmail

`MAILERSEND_ENABLED=false` er standard i `.env.example`. Tester bruker falske
HTTP-responser og sender ingen ekte e-post. For en bevisst lokal integrasjonstest
legges egne credentials i `.env.local`, og flagget settes til `true`; filen skal
aldri sjekkes inn.

Når flagget er `false`, vises fortsatt de offentlige skjemaene, men det sendes
ingen tilgangs- eller bekreftelsesmail. Oppslag uten treff kan fortsatt vises,
mens et treff som krever utsendelse gir en teknisk feilmelding. Bruk derfor
testadresser og en ikke-produksjonsdatabase ved lokal gjennomgang av hele
selvbetjeningsflyten.

I `/admin/surveys` åpner administratoren en eksisterende undersøkelse og velger
**Utsendelse**. **Send testmail** krever én eller maksimalt to eksplisitte,
komma-separerte mottakere (feltet foreslår innlogget administrators e-post),
bruker produksjonsmalen og leverandøren, men
lenker bare til `/survey` uten medlems-token. Dermed kan testen aldri sende til
medlemsregisteret eller gi tilgang på vegne av et medlem.

### Masseutsendelse og idempotens

Masseutsendelse er sperret både i grensesnittet og på serveren når
`MAILERSEND_BULK_ENABLED` ikke er nøyaktig `true`. Standardinnstillingen er
`false`; den skal ikke endres før masseutsendelse er uttrykkelig godkjent.
I tillegg må Netlifys forespørselskontekst (`getContext().deploy.context` fra
`@netlify/functions`) og `APP_ENVIRONMENT` begge være `production`, og
`MAILERSEND_JOB_SECRET` må være minst 32 tegn. Byggvariabelen `CONTEXT` brukes
ikke som kjøretidsbevis: den er ikke garantert tilgjengelig i Functions.
Manglende forespørselskontekst, lokal Netlify-kjøring og preview avvises også
om en lokal miljøfil inneholder produksjonsverdier. Se
[Netlifys kjøretidskontekst](https://docs.netlify.com/build/functions/api/#getcontext)
og [miljøvariabler i Functions](https://docs.netlify.com/build/functions/environment-variables/).
Kontrollen skjer før kampanje og
leveranser opprettes, slik at localhost eller feilkonfigurerte deployer ikke kan
etterlate en utsendelse i «Venter». Testmail til inntil to eksplisitte adresser
er fortsatt tilgjengelig uten bakgrunnsjobben.
Oversikten returnerer `background_status` med `ready`, `production_required`
eller `job_secret_missing`, aldri hemmeligheten. Start-/gjenopptakingsknappen
skjules ikke ved manglende oppsett; den deaktiveres med en lesbar forklaring.

Før utsendelse velger administrator en e-postgruppe, enkelttomter eller begge.
Ingen gruppe velges automatisk. Hoved-e-post benyttes som standard, med et
eksplisitt valg for øvrige registrerte adresser. Preview viser kontaktperson,
hjemmelshaver, hoved-e-post og faktisk mottakeradresse før bekreftelse.
Én `email_campaigns`-rad og én `email_deliveries`-rad per tomt/mottaker opprettes
i samme transaksjon. Medlemsstatus, aktuell kontaktadresse og eventuell
gruppe for leveransen kontrolleres på nytt rett før sending. Nye grupper eller
enkelttomter kan legges til en pågående eller fullført kampanje uten å gjenta
invitasjoner som allerede er registrert. Svarregelen låses etter første
invitasjon/svar. Se [detaljer om mottakere og kvitteringer](docs/survey-options-and-recipients.md).
Utsendelsespanelet skiller ventende, sendte, feilede og undertrykte
hoved-e-postkvitteringer. Feilede og undertrykte kvitteringer vises med
H-nummer, adresse, mottaker, status og en kontrollert årsaksforklaring. Rå
leverandørsvar vises eller lagres ikke i panelet.
Den unike kampanjeindeksen gjør at refresh,
gjentatt request eller Netlify-retry ikke oppretter en ny utsendelse for samme
survey.

`survey-email-background` hevder én ventende levering atomisk og sender
kontrollert med minst 0,75 sekunder mellom Email API-kall. Sammen med tiden for
selve kallet holder dette god margin til MailerSends dokumenterte grense for
`POST /email`, uten ukontrollerte browser-kall. Ved HTTP 429 legges den hevde
leveringen tilbake i køen uten å telle som feilet. Kampanjen lagrer leverandørens
`Retry-After` eller tidspunktet for nullstilling av dagskvoten, og
`background-watchdog` starter den automatisk igjen etter dette tidspunktet. For
hver levering opprettes en ny, hashet invitasjonskode bundet til medlem,
undersøkelse, mottakeradresse og miljø. Den rå koden brukes bare til invitasjons-URL-en og
lagres eller logges ikke. Koden kan opprette en ny kortvarig økt når samme
invitasjonslenke åpnes på nytt, men bare frem til svar, tilbakekalling eller
utløp.
Hvis en worker avbrytes etter at den har hevdet en melding, markeres den etter 15
minutter som `UNCERTAIN_AFTER_INTERRUPTION` i stedet for automatisk å kunne
dobbeltsendes. Administrator ser sendt, levert, feilet og undertrykt per medlem
med paginering; full mottakeradresse vises ikke i oversikten.

### Domene og DNS hos Domeneshop

1. Legg til `turufjellvel.no` som sending domain i MailerSend. Ikke bruk
   MailerSends testdomene i produksjon.
2. Åpne domenets **Domain verification / DNS records** i MailerSend og kopier de
   konkrete verdiene som vises der. De skal ikke kopieres fra denne README-en.
3. Registrer hos Domeneshop den viste SPF TXT-posten, begge DKIM CNAME-postene
   og Return-Path CNAME-posten med nøyaktige navn og verdier.
4. Hvis domenet allerede har en SPF TXT-record, slå MailerSend-mekanismen sammen
   med den eksisterende posten. Det skal bare finnes én SPF-record; opprett ikke
   en konkurrerende nummer to.
5. Behold og vurder eksisterende DMARC-policy. Endre ikke DMARC uten å kontrollere
   at alle legitime avsendere er justert mot SPF og/eller DKIM.
6. Vent til MailerSend viser domene, SPF, begge DKIM-poster og Return-Path som
   verifisert. Kontroller også at valgt `MAILERSEND_FROM_EMAIL` faktisk finnes,
   og at Reply-To overvåkes.

### Webhook og leveringsstatus

Opprett en MailerSend-webhook med URL
`https://medlemsservice.turufjellvel.no/api/webhooks/mailersend`. Abonner minst
på `activity.sent`, `activity.delivered`, `activity.soft_bounced`,
`activity.hard_bounced` og, dersom planen støtter det, `activity.suppressed`;
`activity.spam_complaint` og
`activity.unsubscribed` bør også tas med. Åpne- og klikkhendelser er ikke
nødvendige. Kopier webhookens individuelle Signing Secret til
`MAILERSEND_WEBHOOK_SIGNING_SECRET`.

Ved første bootstrap kan applikasjonen deployes med `MAILERSEND_ENABLED=false`
og uten webhook-secret. MailerSends opprettelsesping har eventtypen
`webhook.test` og kontrolleres mot leverandørens dokumenterte faste test-secret;
den kan derfor validere URL-en uten å åpne for virkelige aktivitetshendelser.
Etter at webhooken er lagret, kopieres dens individuelle Signing Secret til
Netlify og en ny deploy utløses. Sett deretter `MAILERSEND_ENABLED=true`, send
testmailene og kontroller leveringsstatus før masseutsendelse.

Endepunktet følger [MailerSends webhook-signering](https://developers.mailersend.com/api/v1/account/webhooks):
HMAC-SHA256 beregnes over rå request-body og sammenlignes konstant-tid med
`Signature`-headeren. Event-ID lagres i `email_webhook_events`, slik at retry er
idempotent. Ukjent message ID aksepteres uten å endre en levering. Permanent
bounce, spam, unsubscribe og suppression registreres lokalt og vises for admin;
e-postadressen slettes eller endres aldri automatisk i `members`.

### Database og personvern

Kjør `npm run db:setup` med `DATABASE_URL_UNPOOLED` før versjonen deployes.
Endringen oppretter additivt:

- `email_campaigns` for idempotent jobbidentitet, valgt e-postgruppe og summer
- `email_deliveries` for mottaker, type, emne, provider message ID og status
- `email_webhook_events` for idempotente leveringshendelser
- `email_suppressions` for adresser som ikke skal forsøkes sendt igjen
- `member_access_tokens`, `member_sessions`, `member_email_changes`,
  `survey_access_tokens`, `survey_sessions`, `member_requests` og
  `member_profile_updates` for engangstilgang og administrativ behandling
- `security_rate_limits` og `security_events` for delt misbruksvern og
  append-only sikkerhetslogging

Full HTML, plain-text og survey-token lagres ikke. Mottakeradressen lagres fordi
den kreves for leveringskobling, feilsøking og suppression; fastsett tilgang,
oppbevaring og slettefrist som del av behandlingsprotokollen. Tracking av åpning
eller klikk er ikke nødvendig og er derfor slått av. Dersom dette senere endres,
må personvernformål, informasjon til medlemmer og oppbevaring vurderes først.

Før en produksjonsutsendelse:

- kontroller at domene, SPF, DKIM og Return-Path er verified i MailerSend
- send testmail til minst Gmail og Microsoft 365
- kontroller mottakerens headere for bestått SPF, DKIM og DMARC
- kontroller From, Reply-To, mobilvisning, synlig fallback-URL og at bildet ikke
  er nødvendig for å forstå e-posten
- kontroller at webhooken oppdaterer levert og en kontrollert feilhendelse
- kontroller Netlify-rategrense/WAF for adminruten i tillegg til applikasjonens
  per-instans rategrense
- start først deretter den bekreftede masseutsendelsen

## Medlemsservice og Microsoft 365

Åpne `/admin` for startsiden i Medlemsservice, `/admin/inbox` for oppgaver,
`/admin/members` for medlemmer, `/admin/members/groups` for grupper,
`/admin/members/newsletters` for nyhetsbrev, `/admin/map` for kartkontroll,
`/admin/members/matrikkel` for matrikkeloppdatering, `/admin/surveys` for
undersøkelser eller `/admin/web` for nettsider. `/admin/usage` viser anonym
bruksstatistikk, og `/admin/audit` viser hvem som har gjort endringer i sentrale
tabeller, med før- og etterverdier og lenker tilbake til relevante poster. Publiserte
CMS-sider vises automatisk på den offentlige forsiden og på sin egen slug.
Oversiktene kan sorteres på kolonneoverskriftene. Medlemslisten har søk,
filter for registrert administratorkommentar og uendelig rulling; klikk på en
rad for å åpne redigeringspanelet fra høyre.
Medlemmer og undersøkelser kan opprettes, redigeres og mykslettes via en egen
bekreftelsesdialog. Både siden og datatilgangen krever en autorisert økt.
Det finnes ingen mock-innlogging eller åpen admin-API. Mock-modus påvirker
bare datakilden, og krever også Microsoft-innlogging.

Innlogging bruker Auth.js (`next-auth`) og Microsoft Entra ID. Registrer en
**single-tenant** web-app i organisasjonens Microsoft Entra ID:

1. Åpne Entra ID → App registrations → New registration, og velg kun kontoer
   i egen organisasjon.
2. Legg til Web redirect URI for lokal utvikling:
   `http://localhost:3000/api/auth/callback/microsoft-entra-id`.
   Legg også til tilsvarende URI med det faktiske HTTPS-produksjonsdomenet.
3. Opprett en client secret under Certificates & secrets. Kopier **verdien**,
   ikke secret-ID-en, direkte til serverens miljøvariabler.
4. Sett variablene nedenfor i `.env.local` og tilsvarende i Netlify ved deploy:

```env
AUTH_SECRET=<tilfeldig hemmelighet, minst 32 bytes>
AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=<Directory tenant ID>
AUTH_MICROSOFT_ENTRA_ID_ID=<Application client ID>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<client secret-verdi>
AUTH_URL=http://localhost:3000
ADMIN_EMAILS=<kommaseparert liste over eksplisitt godkjente kontoer>
ADMIN_REQUIRED_ROLES=<valgfrie Entra app-roller>
APP_ENVIRONMENT=development
TOKEN_AUDIENCE=tfv-development
SECURITY_EVENT_HMAC_KEY=<unik hemmelighet, minst 32 bytes>
```

`AUTH_SECRET` er generert lokalt. De tre Microsoft-verdiene må fortsatt fylles
inn av en Microsoft 365-administrator. Ingen av variablene skal ha `NEXT_PUBLIC_`
prefiks. `AUTH_URL` skal være det faktiske HTTPS-domenet i produksjon.

Tilgang krever riktig tenant, e-post på nøyaktig `@turufjellvel.no` og medlemskap
i obligatorisk `ADMIN_EMAILS`. Manglende, tom eller ugyldig allowlist stenger
admin. `ADMIN_REQUIRED_ROLES` kan i tillegg kreve Entra-app-roller for minste
privilegium. Opprett rollene `TFV.ReadOnly`, `TFV.MemberAdmin`,
`TFV.SurveyAdmin`, `TFV.CmsEditor`, `TFV.MatrikkelAdmin` og
`TFV.SecurityAudit`, aktiver **Assignment required**, og krev MFA og egnet
Conditional Access. Økter varer maksimalt åtte timer.

### Kontroller

```bash
npm run check
```

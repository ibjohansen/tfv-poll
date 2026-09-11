# Medlemsservice · Turufjell Vel

En modulbasert medlemsservice bygget med Next.js, React, Node, Neon Postgres og
Neon Object Storage. Den har medlemsregister, undersøkelser og et strukturert
CMS for informasjonssider.

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

- `/` er en offentlig forside med logo, hovedinnhold og bunnfelt.
- **Mine medlemsopplysninger** ligger alltid på forsiden før publiserte artikler.
  Et medlem kan be om en 24-timers e-postlenke med H-nummer, gateadresse eller
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
- `/admin/surveys` er modulen Undersøkelser.
- `/admin/web` er CMS-et for nettsider, hovedbilder og nedlastbare vedlegg.
- `/admin/audit` er den administratorbeskyttede oversikten Brukerendringer med
  før- og etterverdier for endringer i sentrale tabeller.
- `/<slug>` viser en publisert informasjonsside. Utkast kan bare forhåndsvises
  fra administrasjonen.
- De seks sist publiserte informasjonssidene vises automatisk på `/`.
- Undersøkelsen ligger på `/survey?klm=<ID>&xyz=<undersøkelses-ID>`.
- Svar sendes til `/survey/api/responses`, og dokumenter ligger under `/survey/dokumenter/`.
- Andre sider og API-er krever autorisert innlogging som standard, også nye ruter.
  Innloggingsendepunkter og nødvendige statiske ressurser er offentlige.
- Gamle medlemslenker til `/?member=...` må oppdateres til `/survey?klm=...&xyz=...`.

## Arkitektur

Skissene følger nivåene i [C4-modellen](https://c4model.com/): først systemets
kontekst, deretter containere (kjørbare eller lagrende deler). Mermaid-diagrammene
renderes direkte i GitHub og de fleste Markdown-visere.

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

  member -->|"Ser data, retter kontaktfelt eller svarer"| app
  admin -->|"Administrerer medlemmer, undersøkelser og nettsider"| app
  app -->|"Logger inn administrator"| entra
  app -->|"Leser og skriver data"| neon
  app -->|"Lagrer og henter CMS-filer"| storage
  app -->|"Sender e-post server-side"| mailer
```

### Containere

```mermaid
flowchart TB
  browser["Nettleser\nOffentlig forside, undersøkelse og Medlemsservice"]
  next["Next.js / Node.js\nApp Router, sider, API-ruter og tilgangskontroll"]
  auth["Auth.js\nMicrosoft Entra ID-integrasjon"]
  db[("Neon Postgres\nmembers · member_requests · surveys · responses · CMS")]
  storage[("Privat Neon Object Storage\ncms-assets")]
  files["Statiske dokumenter\npublic/survey/dokumenter"]
  matrikkel["Kartverket\nAdresse-API, A5 og Matrikkel SOAP-API"]
  norgeskart["Kartverket Norgeskart\ninnbygd eiendomskart"]
  worker["Netlify Background Function\nmatrikkelsynkronisering"]
  emailworker["Netlify Background Function\nsurvey-utsendelse"]
  mailer["MailerSend Email API\nlevering og suppression"]

  browser -->|"HTTPS"| next
  next -->|"OAuth/OIDC"| auth
  auth -->|"Innlogging"| entra["Microsoft Entra ID"]
  next -->|"TLS, server-side DATABASE_URL"| db
  next -->|"S3 API, server-side credentials"| storage
  next -->|"Leverer"| files
  next -->|"Starter rollebeskyttet jobb"| worker
  next -->|"Starter bekreftet utsendelse"| emailworker
  emailworker -->|"Personlige meldinger over HTTPS"| mailer
  mailer -->|"Signerte delivery/bounce-webhooks"| next
  worker -->|"Server-side API-kall"| matrikkel
  browser -->|"Adresseoppslag og kartvisning"| norgeskart
  worker -->|"Snapshot, status og oppdateringer"| db
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
| `app/admin/*` og `app/api/admin/*` | Viser og endrer medlemmer/undersøkelser etter Microsoft-innlogging. |
| `app/api/member-access/*` og `lib/member-self-service.js` | Matcher medlem server-side, sender tidsbegrenset tilgangslenke, validerer den hash-lagrede hemmeligheten og tillater bare retting av kontaktfeltene. |
| `app/api/membership-requests/*` | Tar imot ny innmelding, verifiserer oppgitt e-post og legger forespørselen i administrativ behandlingskø. |
| `app/api/admin/member-requests/*` | Krever Entra-basert administratortilgang og godkjenner eller avviser verifiserte eierskifter og innmeldinger. |
| `app/admin/web/*` og `app/api/admin/cms/*` | Administrerer strukturert sideinnhold og filmetadata. Alle endringer krever adminøkt. |
| `app/admin/audit`, `lib/admin-audit.js` og databasetriggere | Viser et skrivebeskyttet revisjonsspor for medlemmer, henvendelser, undersøkelser, svar, nettsider og vedlegg. |
| `app/[slug]/page.js` og `components/CmsPageView.js` | Viser kun publiserte sider med systemstyrt typografi og avsnitt. |
| `app/api/cms/files/*` og `lib/cms-storage.js` | Leverer filer fra en privat bøtte etter kontroll av publiseringsstatus eller adminøkt. |
| `lib/admin-*.js` | Felles serverlogikk for sortering, opprettelse, oppdatering og myk sletting. |
| `lib/matrikkel-client.js` | Server-side klient for Adresse-API, A5-avvik og Matrikkelens SOAP-tjenester. |
| `lib/matrikkel-sync.js` | Oppretter sikkerhetskopi, behandler medlemmer og lagrer fremdrift og avvik. |
| `netlify/functions/matrikkel-sync-background.mjs` | Kjører lange synkroniseringer uten å holde nettleserforespørselen åpen. |
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

  M->>B: Åpner /survey?klm=token&xyz=survey-secret
  B->>A: GET /survey
  A->>A: Validerer formatet på begge secrets
  A->>D: Henter aktivt medlem og åpen undersøkelse før sluttdato
  D-->>A: Medlemsdata, spørsmål og eventuell tidligere besvarelse
  A-->>B: Skjema eller tydelig tilgangs-/statusmelding
  M->>B: Velger ja, nei eller usikker
  B->>A: POST /survey/api/responses
  A->>A: Validerer origin, rategrense, lenke og svar
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

  M->>B: Oppgir H-nummer, adresse eller e-post og velger Søk
  B->>A: POST /api/member-access/request med action=search
  A->>D: Søker etter ett entydig aktivt medlem
  A-->>B: Viser ikke-treff eller tomt, adresse og maskert e-post
  M->>B: Velger Send meg en sikker lenke
  B->>A: POST /api/member-access/request med action=send
  A->>D: Lagrer SHA-256-hash med 24 timers utløp
  A->>E: Sender personlig tilgangslenke til registrert hoved-e-post
  M->>A: Åpner lenken
  A->>D: Validerer hash og utløp
  A-->>B: Setter HttpOnly-cookie og fjerner secret fra URL-en
  M->>B: Retter kontaktfelt eller melder eierskifte
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
  opt Bilde eller vedlegg
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
Den lokale installasjonen bruker nå Neon med `MOCK_DATA=false`.
Start eller start utviklingsserveren på nytt med `npm run dev`.
Ingen database brukes til medlemsoppslag eller innsendinger i denne modusen.
Alle medlemsopplysningene er fiktive. Modusen er deaktivert i produksjon
(`npm run build` / `npm run start` bruker den ordinære databaseløsningen).
Den e-postbaserte medlemsselvbetjeningen og behandlingskøen kan ikke testes i
mock-modus og utfører ingen reell utsendelse der; de krever Neon og en bevisst
aktivert MailerSend-konfigurasjon.

Testlenker:

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

Neon CLI, prosjektets Neon-skills og MCP-konfigurasjon for Codex er installert.
MCP bruker OAuth og er avgrenset til `ancient-wildflower-97748936`.
CLI-innlogging og MCP-innlogging fullføres separat i nettleseren.

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

Prosjektet er koblet til `production`. Ved oppsett på en ny maskin:

```bash
neon login
neon link --project-id ancient-wildflower-97748936 --branch production -y
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

Skjema og CSV-medlemmer er importert til production. Lokal mock-modus er slått av.

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

6. Kjør `npm run db:setup`. Skriptet krever den direkte URL-en, slik at
   migrering aldri går via PgBouncer.

## Strukturert CMS

CMS-et ligger på `/admin/web`. Oversikten har tittelsøk og viser tittel,
kategori, status, endringsdato, publiseringsdato og handlinger. Redigering skjer
i et panel fra høyre. En side består av:

- obligatorisk tittel og automatisk foreslått URL-slug
- kategori, valgfri ingress og valgfri hovedtekst
- valgfritt hovedbilde med alt-tekst og bildetekst
- inntil 20 vedlegg med visningsnavn og redigerbar rekkefølge
- status `Utkast` eller `Publisert`, samt opprettet-, endret- og publisertdato

Tekst lagres uten HTML eller Markdown. Tomme linjer og linjeskift gjøres til
avsnitt i den offentlige visningen. Hovedbilder støtter JPG, PNG og WebP opp til
10 MB. Vedlegg støtter PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, ZIP, JPG, PNG, WebP og
GIF opp til 20 MB per fil. Filinnhold kontrolleres mot filendelsen før opplasting.

Publiserte sider vises på `/<slug>` og på forsiden. Forhåndsvisning av utkast
krever adminøkt. Sider og filmetadata mykslettes med `deleted_at`; vanlige
spørringer henter dem aldri. Binærfilen beholdes i lagringsbøtten når redaktøren
sletter den, slik at slettingen er reverserbar på datanivå.

## Dokumenter

Legg PDF-er eller andre filer i:

```text
public/survey/dokumenter/
```

Registrer dem deretter i `data/survey.js` i arrayet `surveyDocuments`.

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

Prosjektet bruker `main` som produksjonsgren. Alle pushes og pull requests
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

## Produksjonssetting: Netlify + Neon + Microsoft Entra ID

`netlify.toml` inneholder byggkommando, publiseringsmappe, Node-versjon og
funksjonsmappe. Netlify håndterer Next.js App Router gjennom sin Next.js-adapter,
mens den lange matrikkelsynkroniseringen kjøres som en Netlify Background
Function. Survey-utsendelser kjøres på samme måte i en egen bakgrunnsfunksjon.
Se også [Netlifys Next.js-veiledning](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
og [veiledningen for Background Functions](https://docs.netlify.com/build/functions/background-functions/).

Følg punktene i denne rekkefølgen ved første produksjonssetting. Bruk en konto
med tilgang til GitHub-repositoriet, Netlify-teamet, Neon-prosjektet og
appregistreringen i Microsoft Entra ID.

### 1. Kontroller kode og GitHub

1. Kontroller at siste commit ligger på `main` i `ibjohansen/tfv-poll`.
2. Åpne fanen **Actions** i GitHub og kontroller at arbeidsflyten
   **Code quality** er grønn for committen som skal publiseres.
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
4. Kjør databaseskjemaet med den direkte forbindelsen når `database/schema.sql`
   er endret:

```bash
npm run db:setup
```

Kommandoen er idempotent. Den kjørende Netlify-applikasjonen skal bruke pooled
`DATABASE_URL`; migrering og import skal bruke den direkte forbindelsen. Dette
følger [Neons anbefaling for pooling og migrering](https://neon.com/docs/connect/connection-pooling).

Skjemaet oppretter også `audit_log` og triggere på `members`, `member_requests`,
`surveys`, `survey_responses`, `cms_pages` og `cms_attachments`. Loggen starter
når migreringen kjøres; den rekonstruerer ikke historikk fra tidligere
endringer. Tilgangstoken, verifiseringshash og interne lagringsnøkler utelates.

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

Lag en ny `AUTH_SECRET` for produksjon, for eksempel lokalt med:

```bash
openssl rand -base64 32
```

#### Påkrevd for matrikkelsynkronisering

| Variabel | Produksjonsverdi |
| --- | --- |
| `API_MATRIKKEL_BASE_URL` | `https://matrikkel.no/matrikkelapi/wsapi/v1` |
| `API_MATRIKKEL_USR` | Matrikkel-brukernavn |
| `API_MATRIKKEL_PWD` | Matrikkel-passord, skrevet normalt uten `\$`-escaping |
| `MATRIKKEL_SYNC_EMAILS` | Kommaseparert rolle-allowlist, minst `ib@turufjellvel.no` |
| `MATRIKKEL_JOB_SECRET` | En annen unik hemmelighet på minst 32 bytes |

Generer `MATRIKKEL_JOB_SECRET` separat; ikke bruk samme verdi som `AUTH_SECRET`.

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
API-tokenet må minst ha tillatelsene `email_full` og `suppressions_read`, og bør
begrenses til sending domain der MailerSend-kontoen tilbyr dette.

#### Valgfritt eller skal utelates

- Utelat `ADMIN_EMAILS` for å tillate alle godkjente kontoer i den konfigurerte
  tenant-en med nøyaktig `@turufjellvel.no`. Sett den bare hvis admin skal
  begrenses ytterligere.
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

1. Gå til **Deploys** i Netlify.
2. Velg **Trigger deploy → Deploy site**. Bruk **Clear cache and deploy site**
   hvis forrige bygg ble kjørt før miljøvariablene ble lagt inn.
3. Kontroller at byggeloggen avsluttes uten feil.
4. Kontroller at Next.js-funksjonene og
   `matrikkel-sync-background` og `survey-email-background` finnes i Netlifys
   funksjonsoversikt.
5. Kontroller at den publiserte deployen bruker committen som var godkjent i
   GitHub Actions.

Etter at GitHub-repositoriet er koblet til Netlify, utløser senere pushes til
`main` normalt en ny produksjonsdeploy.

### 7. Verifiser produksjonen

Utfør kontrollene i denne rekkefølgen:

- Åpne `/` og kontroller toppbilde, publiserte artikler og artikkelpanelet.
- Kontroller at **Mine medlemsopplysninger** alltid vises før artiklene. Be om
  lenke med en kontrollert testbruker via H-nummer, adresse og e-post, og
  kontroller at alle tre gir mail til den registrerte hovedadressen. Ved treff
  skal svaret bare vise tomt, adresse og maskert hoved-e-post; ved ikke-treff
  skal den innskrevne søkeverdien vises uten andre medlemsopplysninger. Sjekk
  at sendeknappen bare vises etter treff, og at søk på `H25`, `H-25`, `h25`,
  `h-25`, `H  25` og `25` finner samme H-nummer.
- Åpne tilgangslenken og kontroller at URL-en straks renses, at tilgangen utløper
  etter 24 timer, at H-nummer/adresse/hjemmelshaver er skrivebeskyttet, og at
  kontaktperson og e-postadresser kan oppdateres.
- Kontroller at forsidebildet viser et bredere utsnitt med fokus forskjøvet mot
  venstre, og at loginbildet viser et vesentlig bredere utsnitt uten å miste
  fokuspunktet.
- Åpne `/admin` i et privat vindu og kontroller at du sendes til innlogging.
- Logg inn som `ib@turufjellvel.no` og kontroller modulene Medlemsregister,
  Oppgaveliste, Undersøkelser, Web og Brukerendringer. Velg et medlem med gateadresse, og kontroller
  at eiendomskartet er lukket under adressefeltet i detaljpanelet og kan åpnes.
  Kontroller at lukkeknappen forblir synlig når panelet rulles. Kontroller at
  H-nummer, adresse og de øvrige eiendomsfeltene ikke kan redigeres etter
  opprettelse. Aktiver filteret for mangelfull hovedkontakt eller hoved-e-post
  og kontroller at bare relevante medlemmer vises. Aktiver deretter filteret
  for registrert kommentar og kontroller at alle og bare kommenterte medlemmer
  vises, også i kombinasjon med søk.
- Gjør en kontrollert endring på et testmedlem. Åpne `/admin/audit`, kontroller
  riktig innlogget bruker, tidspunkt og før-/etterverdi, og bruk lenken tilbake
  til medlemsposten. Kontroller også filtrering på bruker og område. Bekreft at
  tilgangstoken, verifiseringshash og lagringsnøkler ikke finnes i loggen.
- Send ett kontrollert eierskifte og én ny innmelding med testdata. Oppgi
  gårds-/bruksnummer og eventuelt seksjonsnummer. Kontroller at innmeldingen
  vises som ubekreftet i `/admin/inbox` før e-postlenken åpnes, og som bekreftet
  etterpå. Kontroller matrikkelopplysningene fra oppgavelisten. Bruk også en
  seksjonert testeiendom og kontroller at manglende eller ugyldig seksjonsnummer
  krever kontroll eller eksplisitt manuell bekreftelse før saken kan godkjennes.
  Fjern testdataene etterpå.
- Åpne en undersøkelse, kontroller kakediagrammene under **Resultater**, og last
  ned en Excel-eksport.
- Velg **Utsendelse**, send først en testmail til en eksplisitt testadresse, og
  kontroller MailerSend-statusen. Start ikke masseutsendelsen før domenekontrollen
  nedenfor er fullført.
- Opprett et CMS-utkast, last opp et lite testvedlegg, forhåndsvis, publiser og
  kontroller den offentlige visningen. Kontroller også at sideoversikten kan
  brukes uten horisontal rulling på mobil. Fjern testinnholdet etterpå.
- Generer eller bruk testlenken for eget medlem med H-nummer 25. Kontroller
  opplysningene uten å sende inn et svar dersom undersøkelsen er reell. Kontroller
  at eiendomskartet søker på gateadressen i Flå, starter med adresseinformasjonen
  minimert, og at **Åpne i Norgeskart** åpner kartet på Norgeskarts nettside.
- Kjør bare **Test H-nummer 25** i matrikkelmodulen. Kontroller logg og resultat
  før en full matrikkelkjøring startes.
- Kontroller at `/api/admin/surveys` returnerer `401` uten innlogget sesjon.
- Kontroller at `/api/admin/member-requests/<id>` returnerer `401` uten
  innlogget sesjon, og at `/mine-opplysninger` ikke viser data uten gyldig cookie.
- Kontroller Netlify Functions-loggene for feil og verifiser at ingen
  hemmeligheter skrives til logg.

### 8. Tilbakerulling og etterarbeid

- Ved feil i applikasjonen: åpne **Deploys** i Netlify og publiser siste kjente
  fungerende deploy på nytt.
- Ikke reverser databaseskjemaet automatisk. Endringene er additive; undersøk
  dataene og bruk Neon restore/branch ved behov før en korrigerende migrering.
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

Tabellen `members` har et internt løpenummer (`id`) og en tilfeldig offentlig
lenke-ID (`access_token`, 32 heksadesimale tegn). ID-en genereres av databasen
og er ikke avledet fra H-nummer eller andre medlemsopplysninger.

Lenkeformat:

```text
https://deres-domene.no/survey?klm=<access_token>&xyz=616fd7e9e244b6f4947eb1822dbd01ad
```

Startundersøkelsen i `data/survey.js` seedes til `surveys` ved databaseoppsett.
Nye undersøkelser opprettes og redigeres i administrasjonen. Hver får en
obligatorisk sluttdato og er tilgjengelig ut denne datoen i norsk tid, samt en
tilfeldig 32-tegns hex-ID. Etter sluttdatoen viser medlemslenken at undersøkelsen
er avsluttet og API-et avviser nye svar. Svar lagres som et JSON-objekt med spørsmåls-ID-er
og `surveyVersion`; versjonen økes automatisk når spørsmålene endres. Hver
besvarelse beholder også et snapshot av spørsmålstekstene som var aktive ved
innsending. Eldre svar får beste tilgjengelige snapshot ved migreringen, siden
tidligere spørsmålstekster ikke kan rekonstrueres. Tillatte svar er `ja`, `nei`
og `usikker`.

Klikk på en undersøkelse i `/admin/surveys` og velg fanen **Resultater** for å
se svarfordeling per spørsmål som kakediagram, antall og prosent. Dersom
spørsmålene har blitt endret, vises resultatene separat per spørsmålsversjon.
Excel-eksporten inneholder både en aggregert oppsummering og et detaljark med
én rad per spørsmål og besvarelse. Resultater og eksport er tilgjengelige både
mens undersøkelsen er åpen og etter at sluttdatoen er passert.

Manglende, feilformatert eller ukjent medlems-ID, ugyldig undersøkelse og
allerede innsendt svar vises øverst. Ved databasefeil vises en melding om at
registeret er utilgjengelig. Skjemaet er bare tilgjengelig med gyldig lenke.
API-et validerer samme tilgang på nytt. En unik databaseindeks på
`(member_id, survey_id)` hindrer også dobbeltsvar ved samtidige innsendinger.
Endepunktet har i tillegg en enkel per-instans rategrense og origin-kontroll.
Aktiver tilsvarende delt rategrense/WAF-regel for `/survey` og
`/survey/api/responses` i driftsplattformen før produksjonslansering.

Lenken er en personlig tilgangshemmelighet og gir rett til å svare for tomten.
Den viser medlemsopplysningene for den aktuelle tomten, inkludert kontaktinformasjon.
Del den bare med de aktuelle kontaktene. Lenker utløper etter 180 dager og kan
tilbakekalles ved å sette `access_revoked_at` i medlemsregisteret. Svarene er
koblet til tomten og er ikke anonyme. Siden rendres dynamisk, og `no-referrer`
hindrer at medlemslenken sendes som referanse ved navigasjon til andre nettsteder.
Svar og medlemsopplysninger skal behandles som personopplysninger: dokumenter
formål, tilgang og slettefrist før utsending.

### Mine medlemsopplysninger, eierskifte og innmelding

Forsiden viser alltid **Mine medlemsopplysninger** før artiklene. En registrert
bruker oppgir H-nummer, nøyaktig gateadresse, hoved-e-post eller en registrert
alternativ e-post og velger **Søk**. H-nummeroppslaget ignorerer store/små
bokstaver samt mellomrom eller bindestrek mellom `H` og tallet; eksempelvis
`H25`, `H-25`, `h25`, `h-25`, `H  25` og `25` behandles likt. Oppslaget skjer
bare på serveren. Hvis nøyaktig ett aktivt medlem samsvarer og har en gyldig
hoved-e-post, vises knappen **Send meg en sikker lenke**. Ingen e-post sendes
før medlemmet trykker på denne knappen. Det
offentlige svaret oppgir om søket ga treff. Ved treff vises H-nummer,
gateadresse og en server-maskert hoved-e-post, for eksempel
`ib.***********@*****.com`; den fullstendige adressen returneres aldri til
nettleseren. Ved ikke-treff vises den normaliserte søkeverdien. Flere treff
behandles som ikke-treff fordi medlemmet ikke kan identifiseres entydig.

Tilgangslenken inneholder en kryptografisk tilfeldig hemmelighet på 32 bytes og
varer i 24 timer. Bare SHA-256-hashen lagres i `member_access_tokens`. Når lenken
åpnes, valideres den server-side, den rå hemmeligheten flyttes til en
`HttpOnly`, `SameSite=Lax`-cookie med samme utløp, og nettleseren videresendes
til en ren `/mine-opplysninger`-URL. Secret, e-postinnhold og full
mottakeradresse skrives ikke til applikasjonsloggene. Nye lenker tilbakekaller
tidligere aktive selvbetjeningslenker for samme medlem. Et mislykket MailerSend-
forsøk tilbakekaller den nye lenken, slik at medlemmet kan prøve igjen.

Medlemmet kan se registrerte eiendoms-, kontakt- og kommentaropplysninger,
undersøkelsessvar med spørsmålssnapshot, registrert e-postleveringshistorikk og
egne medlemsforespørsler. En maskinlesbar kopi kan lastes ned som JSON. Bare
`primary_contact_name`, `primary_contact_email` og `other_contact_emails` kan
endres direkte. H-nummer, gårds-/bruksnummer, gateadresse, hjemmelshaver og
tinglysningsdato er skrivebeskyttet. De samme eiendomsfeltene er også
skrivebeskyttet etter opprettelse i adminpanelets medlemsdetaljer.

**Meld eierskifte** oppretter en merket, ventende forespørsel med ny
kontaktperson, hoved-e-post og alternative adresser. Feltverdiene erstattes
først når en innlogget administrator godkjenner saken; offisielle eiendomsfelt
endres aldri av godkjenningen. Godkjenningen tilbakekaller samtidig alle aktive
selvbetjeningslenker for den tidligere eieren. **Meld inn ny tomt** kan brukes når minst
H-nummer eller gateadresse ikke finnes. Skjemaet tar også imot gårds-/bruksnummer
og valgfritt seksjonsnummer. Saken vises umiddelbart i oppgavelisten som
ubekreftet. Oppgitt e-post kan bekreftes med en egen 24-timers lenke, og saken
merkes da som bekreftet. Godkjenning oppretter medlemmet så lenge H-nummer/adresse
fremdeles ikke kolliderer med et aktivt medlem.

Ventende saker vises i den separate oppgavelisten på `/admin/inbox`. Saker med
status `pending_verification` merkes tydelig som ubekreftet, men administrator
kan velge å behandle dem manuelt. Ved innmelding sammenlignes gateadressen med
oppgitt gårds-/bruksnummer. Saksbehandler må deretter kontrollere matrikkelenheten
mot Matrikkel-API-et eller bekrefte den manuelt; seksjonerte eiendommer kan ikke
godkjennes før seksjonsnummeret er avklart. Godkjenning viser en ekstra
advarsel om at e-postbekreftelsen overstyres. Begge endepunktene kontrollerer Microsoft Entra-
administratortilgang server-side. Fordi den offentlige funksjonen nå bekrefter
om H-nummer, adresse eller e-post finnes, kan den brukes til begrenset kartlegging
av registeret selv om e-posten er maskert. Offentlige oppslag og endringer har
origin-kontroll og per-instans rategrense; tilgangsmail og innmelding har i
tillegg en 10-minutters duplikatbrems i databasen. Sett også en delt Netlify WAF-
rategrense på `/api/member-access/*` og `/api/membership-requests*` i produksjon.

Databaseendringen er additiv og oppretter:

- `member_access_tokens` for hash, utløp, bruk og tilbakekalling
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
- Flere `N/A`-rader får ulike interne ID-er og tilfeldige medlemslenker.
- `Matrikkel-eier` og `Matrikkel-tinglyst dato` bevares som tekst, inkludert ` / `.
  Eiernavn vises på separate linjer i både skjema og admin.
- `Navn` ignoreres helt og er ikke påkrevd i CSV-en. Matrikkel-eier brukes alltid som kontaktnavn.
- `Kommentar` lagres som adminfelt, men vises for det aktuelle medlemmet etter
  gyldig 24-timers innlogging fordi selvbetjeningen gir innsyn i lagrede data.
- Gjentatt import oppdaterer medlemmer etter en intern `import_key` basert på
  matrikkelnummer og adresse. Interne ID-er og medlemslenker beholdes også når
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

Importen av `2026-aktiv.csv`: 425 medlemmer, inkludert 14 med `N/A`.
164 rader ble utelatt på grunn av manglende matrikkelnummer eller adresse.
Kilde-CSV og medlemsdata ligger ikke i Git eller `public`.

### Synkronisering med Kartverket

Brukere med matrikkelsynk-rollen får valget **Oppdater matrikkeldata** i
hamburgermenyen. Siden ligger på `/admin/members/matrikkel`. Rollen er adskilt
fra vanlig administratortilgang og konfigureres som en kommaseparert allowlist:

```env
MATRIKKEL_SYNC_EMAILS=ib@turufjellvel.no
```

Variabelen må settes eksplisitt. Dersom den mangler eller er tom, har ingen
brukere tilgang til matrikkelsynkronisering.

Kartverkets produksjonslegitimasjon skal bare ligge i `.env.local` lokalt og i
Netlifys server-side miljøvariabler i produksjon:

```env
API_MATRIKKEL_BASE_URL=https://matrikkel.no/matrikkelapi/wsapi/v1
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

Oppslaget bruker `street_address` som eneste søkenøkkel og kan bare skrive:

| Kartverket/verdi | Medlemsfelt |
| --- | --- |
| Gårds- og bruksnummer | `cadastral_number` |
| Aktive tinglyste eiere | `title_holder` |
| Eierforholdets `datoFra` | `registration_date` |

Før hver kjøring kopieres disse tre feltene for alle aktive medlemmer til
`matrikkel_sync_backups` i samme transaksjon som jobbregistreringen. Dette er et
komplett tilbakerullingsgrunnlag for synkroniseringens endringer, men ikke en
ekstern katastrofesikker `pg_dump`. En full dump må lagres kryptert utenfor den
samme databasen og krever at et eget lagringsmål og en slettefrist velges.

Eksakte treff, inkludert entydige A5-avvik, oppdateres automatisk. Fuzzy-treff,
tvetydige treff og eiendommer uten aktiv tinglyst eier endrer ikke medlemmet.
De vises som avvik og må eventuelt godkjennes manuelt. Ved nettverks- eller
API-feil beholdes alle eksisterende medlemsverdier. Rå SOAP-responser,
fødselsnummer og interne person-ID-er lagres ikke.

Bruk **Test H-nummer 25** før første fullstendige kjøring. Testen bruker samme
serverlogikk, sikkerhetskopi og avviksbehandling, men begrenser snapshot og
oppslag til dette ene medlemmet.

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

Den samme tjenesten leverer survey-invitasjoner, 24-timers tilgang til **Mine
medlemsopplysninger** og e-postbekreftelse av nye innmeldinger. Selvbetjeningen
krever derfor fungerende MailerSend-konfigurasjon, men bruker ingen nye
miljøvariabler. `members` er fortsatt eneste autoritative medlemsregister.

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
`MAILERSEND_BULK_ENABLED` ikke er nøyaktig `true`. Standard og nåværende
innstilling er `false`; den skal ikke endres før masseutsendelse er uttrykkelig
godkjent. Testmail til inntil to eksplisitte adresser er fortsatt tilgjengelig.

Før utsendelse vises antall aktive medlemmer med gyldig primæradresse og antall
som mangler gyldig adresse. Administrator må bekrefte det eksakte mottakertallet.
Deretter opprettes én `email_campaigns`-rad og én `email_deliveries`-rad per
mottaker i samme databasetransaksjon. Den unike kampanjeindeksen gjør at refresh,
gjentatt request eller Netlify-retry ikke oppretter en ny utsendelse for samme
survey.

`survey-email-background` hevder én ventende levering atomisk og sender
kontrollert med minst 6,1 sekunder mellom Email API-kall. Dette holder seg innen
MailerSends dokumenterte lave rategrense og fungerer for dagens omtrent 425
medlemmer uten ukontrollerte browser-kall. Personlig URL opprettes i minnet fra
eksisterende tilfeldig `access_token` og survey-ID, og lagres eller logges ikke.
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

- `email_campaigns` for idempotent jobbidentitet og summer
- `email_deliveries` for mottaker, type, emne, provider message ID og status
- `email_webhook_events` for idempotente leveringshendelser
- `email_suppressions` for adresser som ikke skal forsøkes sendt igjen
- `member_access_tokens`, `member_requests` og `member_profile_updates` for
  tidsbegrenset selvbetjening og administrativ behandling

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
`/admin/members` for medlemmer, `/admin/surveys` for undersøkelser eller
`/admin/web` for nettsider. `/admin/audit` viser hvem som har gjort endringer i
sentrale tabeller, med før- og etterverdier og lenker tilbake til relevante
poster. Publiserte
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
ADMIN_EMAILS=
```

`AUTH_SECRET` er generert lokalt. De tre Microsoft-verdiene må fortsatt fylles
inn av en Microsoft 365-administrator. Ingen av variablene skal ha `NEXT_PUBLIC_`
prefiks. `AUTH_URL` skal være det faktiske HTTPS-domenet i produksjon.

Tilgang krever både riktig tenant og e-post på nøyaktig `@turufjellvel.no`.
Alle slike kontoer har tilgang som standard. Sett `ADMIN_EMAILS` til en
kommaseparert liste for å begrense til bestemte personer. Økter varer maksimalt
åtte timer. Utlogging og endring i tillatt e-postliste håndheves på serveren.
Innlogging er stengt når Microsoft-konfigurasjonen mangler.

### Kontroller

```bash
npm run check
```

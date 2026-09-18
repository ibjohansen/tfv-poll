# Tiltaksplan etter ekstern sikkerhetsgjennomgang

- Status: implementert i kode 12. september 2026; produksjonsutrulling og
  eksterne kontroller gjenstår som angitt nedenfor
- Opprettet: 11. september 2026
- Omfang: Turufjell medlemsservice, Netlify, Neon/Lakebase Postgres,
  Microsoft Entra ID og GitHub

## Mål og styrende prinsipper

Målet er å lukke alle åtte funn i den foreløpige sikkerhetsrapporten og validere
de fem forholdene rapporten ikke kunne teste dynamisk. Arbeidet skal gjennomføres
i små, reverserbare leveranser med eksplisitte sikkerhetstester før produksjon.

Følgende prinsipper gjelder for hele arbeidet:

- Produksjonsdata skal aldri brukes til lokal utvikling eller automatiserte tester.
- Alle hemmeligheter skal være engangshemmeligheter, kortlivede sesjoner eller
  tidsbegrensede og snevert avgrensede invitasjonskoder. De lagres som hash og
  bindes til miljø og formål.
- Autorisasjon skal feile lukket når konfigurasjon eller rolle mangler.
- Offentlige svar skal ikke avsløre om et medlem finnes.
- Personopplysninger og interne notater skal bare returneres når de er nødvendige.
- Sikkerhetsrelevant funksjonalitet skal håndheves server-side og i databasen;
  skjuling i brukergrensesnittet er ikke et sikkerhetstiltak.
- Ingen migrering skal kjøres direkte i produksjon før den er testet på en
  isolert Neon-gren med syntetiske data. Pooled forbindelse brukes i Netlify,
  direkte forbindelse brukes til migrering.
- Eksisterende sikkerhetskontroller skal beholdes og få regresjonstester.

## Implementeringsstatus 12. september 2026

| Område | Status | Gjenstår før ferdig produksjon |
| --- | --- | --- |
| Medlemslenke og e-postbytte | Implementert: 15-minutters engangskode, separat hashet 45-minutters økt og totrinns e-postbekreftelse | Dynamisk test med to kontrollerte postkasser |
| Enumerering og ratebegrensning | Implementert: identisk offentlig respons, Netlify edge-regel og atomisk Postgres-begrensning | Bekreft edge-regelen i deployloggen; velg eventuelt personvernvurdert CAPTCHA |
| Miljøisolasjon | Implementert: databasevakt, audience og miljøbundne token | Flytt lokal utvikling permanent til egen schema-only development-gren og roter gammel produksjonsrolle |
| Administratorpolicy | Implementert: obligatorisk allowlist, app-role-støtte og rutebasert RBAC | Opprett/tildel Entra-app-roller, aktiver Assignment required, MFA og Conditional Access |
| Surveytilgang | Implementert: ett hashet token per medlem/survey, separat økt og minimert profil | Koordiner ugyldiggjøring av gamle lenker og eventuell ny utsendelse; kjør oppryddingsmigrering etter deploy |
| Internt notat | Fjernet fra selvbetjening/JSON og merket internt i admin | To autoriserte personer må gjennomgå eksisterende kommentarer |
| CSP | Implementert med request-nonce og uten `'unsafe-inline'` i `script-src` | Verifiser alle produksjonsflyter og faktiske Netlify-headere |
| Repository | Aktiv README er ryddet og `SECURITY.md` er lagt til | GitHub-eier må kontrollere historikk, secret scanning, push protection, Dependabot og branch protection |

Den additive databasemigreringen er laget for å kjøres før deploy. Fjerning av
de gamle surveykolonnene ligger separat i `database/security-cleanup.sql` og
skal først kjøres etter at ny kode er publisert.

## Bekreftet utgangspunkt i dagens kode

| Funn | Bekreftet berørt kode | Måltilstand |
| --- | --- | --- |
| 1. Gjenbrukbar medlemslenke og e-postbytte | `lib/member-self-service.js`, `lib/member-self-service-utils.js`, `app/api/member-access/verify/route.js`, `app/api/member-access/profile/route.js` | Engangskode byttes atomisk mot separat 30–60 minutters sesjon. Hoved-e-post krever ny bekreftelse og kontroll over gammel adresse. |
| 2. Medlemsenumerering | `app/api/member-access/request/route.js`, `lib/member-self-service.js`, `lib/member-self-service-utils.js`, `lib/rate-limit.js` | Identisk offentlig respons ved treff og ikke-treff, ingen medlemsdata før e-postkontroll, delt begrensning og misbruksdeteksjon. |
| 3. Miljøkryssing | `lib/member-self-service.js`, `.env.example`, `.neon`, README og dagens lokale Neon-oppsett | Separate credentials og databaser/grener, eksplisitt token-audience og hard feil ved miljømismatch. |
| 4. Åpen adminfallback | `lib/admin-policy.js`, `auth.js`, `lib/admin-access.js`, `proxy.js`, `.env.example` | Manglende rolle/allowlist gir avslag. Entra app-roller gir minste privilegium. |
| 5. Survey-token i klartekst | `members.access_token`, `lib/membership.js`, `lib/survey-email.js`, `lib/survey-email-utils.js`, medlems-Excel | Ett hashet token per medlem og undersøkelse, kort levetid, separat surveyøkt og minimal datatilgang. |
| 6. `admin_comment` medlemssynlig | `lib/member-self-service.js`, `components/MemberSelfServiceProfile.js`, JSON-eksport og importdokumentasjon | Feltet klassifiseres og merkes entydig. Anbefalt valg er internt notat som aldri returneres i selvbetjening. |
| 7. CSP med `unsafe-inline` | `next.config.mjs` og `proxy.js` | Nonce- eller hashbasert CSP uten `'unsafe-inline'` i `script-src`, først i Report-Only og deretter håndhevet. |
| 8. Offentlig driftsinformasjon | README, Git-historikk og GitHub-innstillinger | Kun nødvendig offentlig dokumentasjon, aktiv secret scanning/push protection og dokumentert historikksgjennomgang. |

## Fase 0 – strakstiltak før videre funksjonsutvikling

Disse tiltakene skal utføres først og registreres med tidspunkt, utførende og
resultat i en intern hendelseslogg.

### 0.1 Tilbakekall eksponerte og lokale medlemstoken

- Finn tokenet fra skjermbildet uten å kopiere det til saker, terminalhistorikk
  eller logger. Beregn hash lokalt og tilbakekall den samsvarende raden i
  `member_access_tokens`.
- Dersom tokenet ikke lenger er tilgjengelig, tilbakekall alle aktive
  selvbetjeningstoken opprettet i det relevante testtidsrommet. Ved tvil
  tilbakekalles alle aktive selvbetjeningstoken og legitime medlemmer får be om
  en ny lenke.
- Identifiser eventuelle undersøkelsestoken brukt i lokal testing. Roter eller
  tilbakekall disse og vurder om aktive undersøkelsesinvitasjoner må sendes på nytt.
- Undersøk `last_used_at`, revisjonslogg og relevante leveringslogger for bruk
  etter skjermbildets tidspunkt. Ikke legg token, tokenhash eller full URL i
  hendelsesloggen.

Godkjenningskriterium: tokenet kan ikke brukes mot verken lokal eller publisert
applikasjon, og omfanget av andre lokale testtoken er dokumentert.

### 0.2 Stans direkte endring av hoved-e-post

- Blokker endring av `primary_contact_email` i profil-API-et, ikke bare i
  React-skjemaet, inntil løsningen i fase 2 er publisert.
- La medlemmet fortsatt rette kontaktperson og øvrige e-postadresser dersom
  dette godkjennes som akseptabel risiko.
- Vis en tydelig melding om at hoved-e-post må endres via administrasjonen i
  mellomperioden, med dokumentert identitetskontroll hos saksbehandler.

Godkjenningskriterium: en gyldig medlemssesjon kan ikke endre
hoved-e-posten direkte.

### 0.3 Lås administratoradgangen

- Sett en eksplisitt, kontrollert `ADMIN_EMAILS` i produksjon umiddelbart.
- Endre `isAllowedAdmin` slik at manglende eller tom allowlist alltid gir avslag.
- Verifiser med en dedikert, ikke-administrativ Entra-konto at en vanlig
  tenantbruker blir avvist fra både sider og API-er.
- Krev MFA og egnet Conditional Access for de godkjente kontoene i Entra.

Godkjenningskriterium: bare navngitte administratorer får tilgang, og tom eller
manglende konfigurasjon gjør admin utilgjengelig.

### 0.4 Isoler produksjonsdatabasen

- Kartlegg alle maskiner, Netlify-kontekster og integrasjoner som har
  produksjonscredentials.
- Opprett en varig `development`-gren med syntetiske data. Fordi registeret
  inneholder personopplysninger skal utviklingsgrenen være schema-only eller
  bygges fra en godkjent anonymisert kilde, ikke som en ordinær kopi med
  produksjonsrader.
- Opprett et tilsvarende stagingmiljø med egne Netlify-variabler, MailerSend
  sandbox/mottakerallowlist og separat Object Storage.
- Fjern produksjonsforbindelsen fra `.env.local` og standard `.neon`-kontekst.
  Lokale utviklere skal ikke ha en generell produksjonsrolle.
- Roter produksjonsdatabaserollen etter at Netlify er oppdatert, dersom den har
  vært distribuert til utviklermaskiner. Beskytt produksjonsgrenen og vurder
  Neons IP-begrensning dersom Netlify-egress og driftsbehov gjør dette praktisk.

Neon beskriver hver gren som isolert med egen connection string og anbefaler
egne utviklings-/previewgrener; schema-only-grener er beregnet for arbeid med
sensitive data: [Neon branching workflow](https://neon.com/docs/get-started-with-neon/workflow-primer).

Godkjenningskriterium: lokal app starter bare mot development, staging bruker
bare staging, og produksjonscredentials finnes bare i godkjente
produksjons-/driftskontekster.

## Fase 1 – sikkerhetsfundament og miljøbinding

Denne fasen etablerer felles byggesteiner før tokenflytene endres.

### 1.1 Eksplisitt miljø og audience

- Innfør servervariablene `APP_ENVIRONMENT` og `TOKEN_AUDIENCE` med ulike,
  ikke-hemmelige verdier for development, staging og production.
- Opprett en singleton-konfigurasjon i databasen, for eksempel
  `application_environment`, som angir databasens miljø. Applikasjonen skal
  sammenligne denne med `APP_ENVIRONMENT` før den utsteder eller konsumerer
  sikkerhetstoken.
- Legg `environment`, `audience` og `purpose` på alle nye tokenrader. Alle
  verifikasjonsspørringer skal kreve eksakt samsvar.
- Legg inn fail-fast validering i build og runtime. Produksjonsbygg skal stoppe
  dersom sikkerhetsvariabler eller adminautorisasjon mangler; ikke-produksjon
  skal stoppe dersom databasen identifiserer seg som production.
- Oppdater `.env.example`, `README.md`, Netlify-prosedyren og sjekklisten uten å
  publisere branch-ID-er, endpointnavn eller credentials.

### 1.2 Sikkerhetshendelser uten hemmeligheter

- Opprett en egen append-only `security_events`-tabell eller en strukturert
  ekstern logg for hendelser som token utstedt/konsumert/avvist, sesjon
  tilbakekalt, rate limit, e-postendring og adminavslag.
- Lagre interne ID-er, aktørtype, tidspunkt, resultat og en HMAC av
  søke-/klientnøkkel. Ikke lagre token, tokenhash, full URL eller rå
  søkeidentifikator.
- Utvid eksisterende `audit_log`-redigering slik at nye token-, sesjons- og
  e-postbekreftelseshash aldri havner i før-/etterverdier.
- Definer oppbevaring, tilgang og varsling før produksjon.

## Fase 2 – engangsinnlogging og sikkert e-postbytte

### 2.1 Skill engangskode fra medlemssesjon

Datamodell:

- Utvid `member_access_tokens` med `consumed_at`, `environment`, `audience` og
  `purpose`. Reduser gyldighet for innloggingskoden, anbefalt til 10–15 minutter.
- Opprett `member_sessions` med tilfeldig ID, `member_id`, `session_token_hash`,
  `created_at`, `expires_at`, `absolute_expires_at`, `last_seen_at`,
  `revoked_at`, `environment` og `audience`.
- Lagre kun SHA-256-hash av en tilfeldig 256-bits sesjonshemmelighet.

Flyt:

1. E-postlenken inneholder en engangskode. Vurder URL-fragment og klientstyrt
   POST-utveksling for å holde koden ute av proxy-/serverlogger; dersom query
   beholdes, må redirect og konsumering skje umiddelbart.
2. Én atomisk databaseoperasjon markerer innloggingskoden som konsumert og
   oppretter en ny medlemssesjon. Samtidige replayforsøk skal gi nøyaktig én
   vinner.
3. Bare den nye sesjonshemmeligheten legges i cookie. Den opprinnelige
   e-postkoden skal aldri ligge i cookie.
4. Bruk en `__Host-`-cookie med `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`
   og uten `Domain` i produksjon.
5. Sett inaktiv/normal sesjonslevetid til 30–60 minutter, anbefalt 45 minutter,
   med absolutt makstid. Rotér sesjonshemmeligheten ved sikkerhetskritiske
   handlinger og tilbakekall den ved utlogging.

Berørte filer: `database/schema.sql`, `lib/member-self-service.js`,
`lib/member-self-service-utils.js`, `app/api/member-access/verify/route.js`,
`app/mine-opplysninger/page.js` og alle profil-/eksportendepunkter.

Akseptansetester:

- Samme e-postkode kan bare konsumeres én gang, også ved parallelle kall.
- E-postkoden virker ikke som cookie og en sesjonscookie virker ikke i
  verifikasjonsendepunktet.
- Utløpt, konsumert, tilbakekalt eller feil-audience kode avvises likt.
- URL-en er fri for hemmeligheten etter utveksling.
- Sesjonen utløper og kan tilbakekalles server-side.

### 2.2 Gjør endring av hoved-e-post til en trinnvis operasjon

Anbefalt modell er en egen `member_email_changes`-tabell med `member_id`, gammel
og ventende adresse, hash av to separate engangskoder, status, utløp,
miljø/audience og tidsstempler.

Flyt:

1. Medlemmet ber om endring i en gyldig sesjon.
2. Operasjonen krever en fersk step-up-bekreftelse sendt til nåværende
   hoved-e-post. En stjålet sesjon alene skal ikke være nok.
3. Etter step-up sendes en separat engangsbekreftelse til den nye adressen.
4. Først når begge kontrollene er bestått, oppdateres `primary_contact_email`
   atomisk.
5. Alle medlemssesjoner og ubrukte tilgangskoder tilbakekalles, og gammel og ny
   adresse varsles uten å inkludere hemmeligheter.
6. Hvis medlemmet ikke kontrollerer gammel adresse, brukes en separat
   administratorbehandlet prosess med dokumentert identitetskontroll.

Kontaktperson og andre e-postadresser skal oppdateres separat slik at de ikke
utilsiktet aktiverer hoved-e-post. Opprettelse, bekreftelse, avvisning og
tilbakekalling skal inn i sikkerhets- og revisjonsloggen.

Akseptansetester:

- Ny adresse blir aldri aktiv bare ved et profil-PATCH.
- Bekreftelseskoder er engangs, hash-lagret, miljøbundet og kortlivede.
- Kontroll av bare gammel eller bare ny adresse fullfører ikke endringen.
- Alle gamle sesjoner blir ugyldige umiddelbart etter fullført endring.
- Varsling og revisjonslogg inneholder før-/etteradresse, men ingen tokenverdier.

## Fase 3 – lukk medlemsenumerering og innfør delt misbruksvern

### 3.1 Ett offentlig svar

- Fjern den offentlige `search`-handlingen og preview av treff. Ett POST-kall
  skal motta identifikatoren og eventuelt sende e-post dersom den matcher.
- Returner samme HTTP-status, JSON-struktur, melding og cache-headere ved treff,
  ikke-treff, manglende mottaker og nylig utsendt e-post:

  > Dersom opplysningene samsvarer med et registrert medlem, sendes en e-post
  > til den registrerte adressen.

- Ikke returner `found`, `canSend`, H-nummer, adresse, maskert e-post eller
  medlemsavhengige feilmeldinger.
- Gjør utsendelsen asynkron eller på annen måte utjevn den observerbare
  behandlingstiden. Ikke bruk lange blokkerende sleeps som kan utnyttes til
  ressursangrep.
- Oppdater forsiden slik at den ikke lover et synlig registeroppslag.

### 3.2 Forsvar i flere lag

- Behold en enkel lokal nødbrems, men flytt autoritativ begrensning til en delt
  mekanisme. Bruk Netlify path-basert rate limiting som første lag og en
  atomisk Postgres-teller som applikasjonslag.
- Databaselaget skal kombinere tidsbøtter for:
  - plattformverifisert klientidentitet/IP
  - HMAC av normalisert søkeverdi
  - internt medlem/mottaker når det finnes treff
  - tilfeldig, kortlivet nettleserindikator
  - samlet systemgrense
- Ikke bruk første brukerleverte verdi i `x-forwarded-for` uten å dokumentere at
  Netlify har overskrevet og verifisert headeren. Foretrekk plattformens
  dokumenterte klient-IP eller edge-kontekst.
- Legg CAPTCHA/bot-kontroll etter noen få forsøk. Leverandørvalg skal vurderes
  for personvern, databehandleravtale, tilgjengelighet og nødvendige CSP-domener.
- Varsle på sekvensielle H-nummer, mange forskjellige identifikatorer fra samme
  kilde, uvanlig utsendelsesvolum og samlet rate-limit.
- Bruk separate og strengere grenser for e-postbytte, innmelding og
  tokenutveksling.

Netlify støtter kildekodebaserte path-regler på alle planer og beskriver hvordan
reglene verifiseres i deployloggen: [Netlify rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/).

Akseptansetester i staging:

- Treff og ikke-treff har identisk offentlig kontrakt og ingen medlemsdata.
- Begrensningen gjelder på tvers av flere samtidige funksjonsinstanser.
- Samme identifikator begrenses selv når klient-IP varierer, og samme IP
  begrenses ved mange identifikatorer.
- Netlify deploylogg bekrefter at regelen er anvendt; over grensen returneres 429.
- CAPTCHA kan brukes med tastatur og skjermleser og har en tilgjengelig fallback.

## Fase 4 – fail-closed RBAC for administratorer

### 4.1 Første leveranse: obligatorisk allowlist

- Gjør `ADMIN_EMAILS` obligatorisk i production og staging.
- Oppdater `isAuthConfigured`, `isAllowedAdmin` og en egen konfigurasjonsvalidator
  slik at tom, ugyldig eller manglende verdi alltid gir avslag og kontrollert
  driftsfeil.
- Legg tester for tom variabel, feil tenant, feil domene, vanlig tenantkonto,
  slettet admin og korrekt admin.

### 4.2 Målbilde: Entra app-roller

Opprett roller med minste privilegium, anbefalt:

- `TFV.ReadOnly`
- `TFV.MemberAdmin`
- `TFV.SurveyAdmin`
- `TFV.CmsEditor`
- `TFV.MatrikkelAdmin`
- `TFV.SecurityAudit`

Rollene kan tildeles sikkerhetsgrupper i Entra. Sett **Assignment required** på
Enterprise Application, få `roles`-claim inn i ID-tokenet, bevar claimen i
Auth.js-JWT/session og kontroller nødvendig rettighet i `proxy.js`, sider,
route handlers og serverfunksjoner. En felles `requirePermission()` skal erstatte
spredte ja/nei-adminsjekker. Microsoft anbefaler RBAC med app-roller og støtter
tildeling til brukere og grupper: [Microsoft Entra app roles](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps).

MFA og Conditional Access er en ekstern Entra-kontroll og skal dokumenteres som
et obligatorisk produksjonskrav, ikke antas ivaretatt av applikasjonen.

Akseptansetester:

- Hver rolle får bare sine eksplisitte sider og API-operasjoner.
- Manglende, ukjent eller manipulert rolle gir 401/403 både i proxy og datalag.
- Endret rolletildeling får effekt senest når administrasjonssesjonen utløper;
  kritisk fjerning kan tvinge tilbakekalling.
- Audit viser riktig Entra-identitet og rolle uten å lagre hele tokenet.

## Fase 5 – redesign undersøkelsestilgangen

### 5.1 Ny datamodell

Opprett `survey_access_tokens` med:

- tilfeldig ID
- `member_id` og `survey_id`
- `token_hash` for en tilfeldig 256-bits hemmelighet
- `environment` og `audience`
- `created_at`, `expires_at`, `consumed_at`, `answered_at` og `revoked_at`
- unik aktiv kombinasjon der det er hensiktsmessig

Opprett en separat, kortlivet `survey_sessions`-tabell eller en tilsvarende
hash-lagret server-side session. Tokenets utløp skal aldri være senere enn
undersøkelsens slutt, og tokenet skal bare gi tilgang til én undersøkelse.

### 5.2 Ny flyt og dataminimering

1. Ved utsendelse opprettes ett token per medlem og undersøkelse; bare hash
   lagres.
2. Tokenet valideres mot medlem, undersøkelse, mottaker, miljø, utløp og
   tilbakekalling før det oppretter en kortvarig survey-session. URL-en renses
   umiddelbart. Samme invitasjonslenke kan opprette en ny økt dersom den forrige
   utløper, men ikke etter innsendt svar, tilbakekalling eller tokenutløp.
3. Survey-sessionen returnerer bare opplysninger som trengs for å bekrefte riktig
   tomt, normalt H-nummer og adresse. Kontaktperson, e-poster, hjemmelshaver og
   tinglysningsdato fjernes dersom de ikke er dokumentert nødvendige.
4. Innsending av svar markerer tilgangen ferdig/tilbakekalt i samme transaksjon
   som svaret lagres.
5. Alle aktive surveytilganger tilbakekalles når medlemmet slettes, eier skiftes
   eller hoved-e-post endres.

Fjern `members.access_token` fra alle lesinger, kampanjer og eksporter. Admins
Excel-eksport skal ikke inneholde en gjenbrukbar surveyhemmelighet eller ferdig
personlig URL. Invitasjoner skal genereres gjennom den kontrollerte
utsendelsesflyten.

### 5.3 Migrering av eksisterende lenker

- Ikke konverter det globale klarteksttokenet til et nytt langlivet token.
- Stopp nye utsendelser med gammel modell før migreringen.
- Kartlegg aktive undersøkelser og informer ansvarlig om at gamle lenker blir
  ugyldige.
- Publiser ny kode og migrering koordinert, tilbakekall/roter eksisterende
  `members.access_token`, og send nye invitasjoner ved behov.
- Fjern gammel kolonne i en senere oppryddingsmigrering etter at ingen kode leser
  den. Kontroller database, Excel-filer, logger, e-postkø og revisjonslogg for
  gjenværende klarteksttoken.

Akseptansetester:

- Databasen inneholder ingen surveyhemmelighet i klartekst.
- Et token for undersøkelse A virker ikke for B eller i et annet miljø.
- Replay etter utveksling og bruk etter innsending avvises.
- URL-en renses, og surveyresponsen inneholder bare avtalte tomtefelt.
- Gamle globale token og tidligere genererte lenker er ugyldige.

## Fase 6 – klassifiser og rydd `admin_comment`

Anbefalt beslutning er at feltet er et internt administrativt notat, fordi navn,
import og ny kommentaroversikt allerede signaliserer dette.

- Gjennomgå alle eksisterende kommentarer med to autoriserte personer før nye
  medlemslenker sendes. Flytt medlemssynlig tekst til et separat, tydelig felt
  dersom slik funksjon faktisk er nødvendig.
- Gi feltet navnet `internal_comment`, eller minst etiketten **Internt notat –
  ikke synlig for medlem** i admin.
- Fjern feltet fra `getSessionMember`, selvbetjeningskomponenten og automatisk
  JSON-eksport.
- Behold det bare i rollebeskyttet adminvisning og revisjonslogg.
- Dokumenter hvordan interne notater håndteres ved en formell innsynsbegjæring;
  automatisk selvbetjeningsinnsyn og juridisk innsynsvurdering er ikke det samme.
- Legg regresjonstest som søker etter feltet i alle offentlige
  serverresponser/eksporter.

Hvis produktansvarlig i stedet bestemmer at kommentaren alltid skal være
medlemssynlig, skal den migreres til `member_visible_comment`, adminteksten skal
forklare synligheten før lagring, og eksisterende innhold skal fortsatt
gjennomgås. Ett felt skal ikke brukes til begge formål.

Godkjenningskriterium: administratoren kan ikke misforstå feltets synlighet, og
interne kommentarer finnes ikke i selvbetjening eller automatisk eksport.

## Fase 7 – streng CSP

- Les den versjonsspesifikke Next.js 16-guiden i `node_modules/next/dist/docs/`
  før implementasjon.
- Flytt CSP-generering fra en statisk header til request-nivå der en kryptografisk
  tilfeldig nonce kan genereres og videreformidles til Next.js. Evaluer
  hash/SRI som alternativ dersom det gir bedre støtte for statiske sider.
- Fjern `'unsafe-inline'` fra `script-src`. Behold bare nødvendige domener og
  vurder `strict-dynamic` i tråd med den valgte Next.js-modellen.
- Kartlegg separat om `'unsafe-inline'` kan fjernes fra `style-src`; dette er
  ikke nødvendig for å lukke rapportens script-funn, men bør være et videre mål.
- Rull først ut `Content-Security-Policy-Report-Only`. Rapportering må ikke
  starte før URL-baserte token er fjernet, og mottaket skal ikke lagre fulle
  sensitive URL-er.
- Kontroller tredjepartsrammen mot Norgeskart, bildeoptimalisering,
  klientnavigasjon, admin, innlogging og alle offentlige skjemaer før enforcing.
- Verifiser den faktisk utsendte produksjonsheaderen etter Netlify-deploy, ikke
  bare `next.config.mjs`.

Next.js dokumenterer nonce-basert CSP og at dette påvirker dynamisk rendering:
[Next.js Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy).

Godkjenningskriterium: produksjonens `script-src` mangler `'unsafe-inline'`, det
finnes ingen CSP-feil i støttede flyter, og en kontrollert inline-script-test
blir blokkert.

## Fase 8 – reduser offentlig driftsinformasjon og styrk repositoryet

- Flytt intern driftsprosedyre med prosjekt-ID, branch-/endpointnavn,
  produksjonsstatus, importvolum og navngitte privilegerte kontoer ut av offentlig
  README. Behold generiske oppsettsinstruksjoner og miljøvariabelnavn som er
  nødvendige for drift og bidrag.
- Erstatt konkrete kontoer og prosjektidentifikatorer med plassholdere.
- Gjennomgå hele Git-historikken med minst GitHub secret scanning og et lokalt
  historikksverktøy. Klassifiser hvert funn; prosjekt-ID-er alene er ikke
  credentials, men unødvendig koblingsinformasjon skal likevel minimeres.
- Kontroller at GitHub Secret Protection/secret scanning, push protection,
  Dependabot-varsler og branch protection er aktivert. GitHub opplyser at public
  repositories kan bruke secret scanning: [GitHub secret scanning](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/detect-secret-leaks/enable-secret-scanning).
- Dersom en reell hemmelighet finnes i historikken: roter den først, fjern den
  deretter fra historikken i en koordinert operasjon, og verifiser forks,
  Actions-logger, artifacts og caches. Ikke omskriv historikk bare for en
  ikke-hemmelig prosjekt-ID.
- Legg til `SECURITY.md` med privat rapporteringskanal og forventet responstid.
- Gjennomgå skjermbilder, issues, Actions-logger, Netlify-logger og artifacts for
  medlemslenker og andre hemmeligheter.

Godkjenningskriterium: ingen gyldige credentials eller medlemstoken finnes i
nåværende tre, Git-historikk, artifacts eller offentlige saker, og unødvendige
produksjonsdetaljer er fjernet fra aktiv dokumentasjon.

## Dynamisk validering av forhold rapporten ikke kunne bevise

Testene skal kjøres i staging med et syntetisk testmedlem og en dedikert
ikke-administrativ Entra-konto. Ingen reelle medlemmer eller produksjonstoken
skal brukes.

| Uavklart forhold | Sikker validering | Bestått når |
| --- | --- | --- |
| Netlify delt rate limit/WAF | Kontroller aktive rulesets og deploylogg. Kjør avtalt, lavvolum grenseprøve fra to klienter. | Reglene er dokumentert, aktivert for publisert deploy og begrenser på tvers av instanser. |
| Lokalt token i produksjon | Tilbakekall først. Sammenlign bare hash/metadata og hendelseslogger server-side. | Alle berørte token er ugyldige og ingen ny lokal utstedelse kan skrive til production. |
| `ADMIN_EMAILS`/roller i produksjon | Les Netlify-konfigurasjon uten å skrive ut verdier. Test godkjent og ikke-godkjent Entra-konto. | Godkjent rolle slipper inn; vanlig tenantkonto avvises overalt. |
| Query-strenger i logger | Lag et ferskt stagingtoken, gjennomfør én flyt og inspiser Netlify/proxy/sikkerhets-/analyseverktøy. | Ingen gjenbrukbar hemmelighet finnes i logger; etter redesign er koden engangs og URL-en renses. |
| E-postvarsler ved adresseendring | Gjennomfør gammel/ny-adresseflyt med to kontrollerte postkasser. | Begge kontrolltrinn og varsler fungerer, og sesjoner tilbakekalles. |

Netlify beskriver rekkefølgen firewall, WAF og rate limiting i sin
[request chain](https://docs.netlify.com/resources/troubleshooting/request-chain/).
WAF-tilgjengelighet avhenger av plan; path-basert rate limiting i kode skal
likevel brukes der det er tilgjengelig.

## Test- og utrullingsstrategi

### Automatiserte tester

- Enhets- og integrasjonstester for tokenhashing, audience, utløp, kontrollert
  gjenåpning av surveyinvitasjoner, sesjonsrotasjon og tilbakekalling.
- Parallelle databasetester som beviser engangsbruk for medlemsinnlogging og
  første-svar-regelen for survey.
- Kontrakttest som sammenligner treff/ikke-treff-respons for status, felter og
  melding.
- RBAC-matrise for alle roller, sider, API-er og serverfunksjoner.
- Regresjonstest som sikrer at token, tokenhash, `internal_comment` og
  databasecredentials ikke finnes i klientprops, eksport, e-postlogg eller audit.
- Surveytester for feil medlem, feil undersøkelse, feil miljø, utløpt eller
  tilbakekalt token, utløpt økt, gjenåpnet invitasjon, innsendt svar og samtidige
  svar.
- CSP-test mot produksjonsbygget og kontroll av sikkerhetsheadere.
- Behold eksisterende tester for parametriserte SQL-kall, origin-kontroll,
  `HttpOnly`/`Secure`/`SameSite`, `no-store`, HSTS, `no-referrer`, `nosniff` og
  frame-blokkering.

### Database og staging

1. Opprett schema-only testgren med automatisk utløp og syntetiske data.
2. Kjør hele `database/schema.sql` med direkte forbindelse.
3. Kjør migreringen to ganger for å bevise idempotens.
4. Kjør token-, replay-, e-post- og surveytestene mot grenen.
5. Bruk `neon branches schema-diff production <testgren>` for å kontrollere at
   bare planlagte skjemaendringer inngår.
6. Deploy staging med egne credentials og gjennomfør dynamisk testmatrise.
7. Slett testgrenen når bevisene er lagret uten personopplysninger.

### Produksjonsrekkefølge

1. Fullfør og dokumenter fase 0.
2. Publiser fail-closed adminpolicy og miljøvakter.
3. Migrer engangsinnlogging og hold direkte e-postbytte deaktivert.
4. Publiser den bekreftede e-postendringsflyten.
5. Lukk enumerering og aktiver delt rate limiting før offentlig flyt åpnes fullt.
6. Migrer surveytilgang koordinert med eventuelle aktive undersøkelser.
7. Rydd kommentarer før nye medlemslenker sendes.
8. Rull ut CSP Report-Only og deretter enforcing.
9. Rydd offentlig dokumentasjon og fullfør repository-kontroller.
10. Be den eksterne testeren reteste alle funn med avtalte stagingkontoer.

Hver produksjonsleveranse krever:

- `npm run check`
- `git diff --check`
- kontroll av at ingen `.env*`, `.neon`, `.netlify`, dumps, eksporter eller
  token er staged
- godkjent schema diff og dokumentert rollback
- grønn GitHub Actions og vellykket Netlify-deploy
- kontroll av faktiske produksjonsheadere og tilgangsgrenser
- overvåking av feil, 401/403/429, e-postvolum og sikkerhetshendelser etter deploy

## Rollback og beredskap

- Nye tabeller og kolonner legges til før gammel flyt fjernes. Gammel flyt skal
  ikke kunne reaktiveres dersom det gjenåpner en kjent sårbarhet.
- Før produksjonsmigrering opprettes et dokumentert Neon restore-punkt eller en
  kortlivet sikkerhetskopieringsgren med strengt begrenset tilgang.
- Kode kan rulles tilbake til siste sikre commit, men kompromitterte eller
  tilbakekalte token skal aldri gjøres gyldige igjen.
- Ved feil i e-postbytte beholdes gammel hoved-e-post og saken sendes til
  administrator; ingen delvis bekreftet adresse aktiveres.
- Ved feil i surveyovergangen pauses utsendelser. Gamle globale token åpnes ikke
  igjen; nye invitasjoner genereres etter retting.
- Ved feil i RBAC brukes en forhåndsgodkjent break-glass-konto med MFA og kort
  levetid, aldri fail-open for hele tenantet.

## Beslutninger og eksterne avhengigheter

Følgende beslutninger må protokollføres, men blokkerer ikke strakstiltakene:

- Produktansvarlig bekrefter at `admin_comment` skal være internt. Dette er
  planens anbefalte standard.
- Entra-ansvarlig oppretter app-roller/grupper, Assignment required, MFA og
  Conditional Access.
- Netlify-eier bekrefter abonnementets WAF-funksjoner og aktiverer minst
  kildekodebasert rate limiting.
- Personvernansvarlig godkjenner CAPTCHA-leverandør, oppbevaring av
  sikkerhetshendelser og gjennomgang av interne kommentarer.
- Undersøkelsesansvarlig godkjenner tidspunkt for ugyldiggjøring og eventuell
  ny utsendelse av aktive invitasjoner.

## Definisjon av ferdig

Sikkerhetsarbeidet er ferdigstilt først når:

- alle åtte funn har implementasjon, automatiserte tester og dokumentert
  produksjonsverifikasjon
- de fem uavklarte dynamiske forholdene er testet uten reelle medlemsdata
- ekstern retest ikke kan gjenta token-replay, miljøkryssing, enumerering,
  uautorisert adminadgang eller klartekst surveytilgang
- gammel hoved-e-post må kontrolleres før ny adresse kan overta kontoen
- interne kommentarer og unødvendige personopplysninger ikke lekker til
  selvbetjening eller survey
- produksjon bruker streng `script-src` uten `'unsafe-inline'`
- utvikling, staging og production har separate credentials, token-audience og
  databaser/grener
- sikkerhets- og driftsdokumentasjonen er oppdatert uten unødvendig offentlig
  produksjonsinformasjon
- rest-risiko er eksplisitt akseptert av systemeier, med dato og ansvarlig

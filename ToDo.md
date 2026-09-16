# ToDo

Gjennomgått 14.–16. september 2026. Kvalitetsarbeidet nedenfor er implementert lokalt;
ingen produksjonsdeploy, GitHub-push eller Entra-endring er kjørt.
Databasemigreringene er testet på en isolert Neon-schema-only-gren og deretter
kjørt i produksjon etter eksplisitt godkjenning. Gjenopprettingspunkter er
opprettet, og eksisterende data er verifisert bevart; se migreringsstatus for
[15. september](docs/database-migration-2026-09-15.md) og
[16. september](docs/database-migration-2026-09-16.md).
Se [kvalitetsgjennomgangen](docs/quality-review.md) for funn, testdekning,
vurdering av brukerloggen og begrensninger. Uferdige produktoppgaver beholdes.

**Avklaringer før de siste punktene kan fullføres:** Delingspraksis/standardverdi
for Turufjell AS, brukerloggens lagringstid og databaseprivilegier, samt
eksplisitt tillatelse til øvrige infrastruktur-/GitHub-endringer, deploy og
funksjonell produksjonsverifikasjon. Statistikken er avgrenset til varige,
anonyme dagsaggregater; ingen rå hendelser beholdes. De øvrige valgene er ikke
antatt eller aktivert.

## Grendepolygoner – implementert lokalt 16. september 2026

- [x] Lagre navngitte GeoJSON-polygoner i eksisterende `member_hamlets`, uten
  hardkodede grender eller et parallelt register. Ingen nye npm-pakker.
- [x] Opprette/velge grend, laste polygon som søkeområde, redigere og fjerne
  lagret geometri uten å endre medlemstilknytninger. Vise alle grendegrenser
  i eget kartlag, med tydelig skille mellom utkast og manuelt kontrollert plassering.
- [x] Beskytte GET/POST med eksisterende medlemsadministratorrettighet,
  servervalidering, versjonskontroll og atomisk brukerlogg. Beholde utkast ved feil.
- [x] Teste validering, tilgang, samtidige lagringer, tilbakeføring ved loggfeil,
  gjentatt migrering og bevaring av grend/medlemmer med isolert Postgres.
  Nettlesertester dekker lagring, gjenåpning, redigering, konflikt og fjerning.
- [x] De 11 digitaliserte grendene er justert og lagret som egne polygoner.
  Lesekontroll mot databasen 16. september bekreftet at alle 11 er aktive, har
  polygon og er markert manuelt kontrollert. Den midlertidige GeoJSON-katalogen
  og utkastvelgeren er derfor fjernet.
- [x] Vise kartet til høyre i **Grender og lagrede polygoner** på større skjermer
  og under kontrollene på mobil. Valg av lagret grend i nedtrekkslisten laster
  polygonet direkte; den separate knappen **Bruk grend i kartet** er fjernet.
- [x] Justere alle «velg + utfør»-kontroller slik at nedtrekksmenyen og den
  tilhørende knappen står horisontalt på samme linje, også i smale visninger.
- [x] Koble sikre, entydige registertreff innenfor et kontrollert grendepolygon
  til `members.hamlet_id` med en eksplisitt karthandling. Eksisterende kobling
  til en annen grend overskrives ikke, og handlingen loggføres uten medlemsliste.
- [x] Godkjenne og utføre produksjonsmigrering for polygonkolonner og
  versjoneringstrigger. Utført og verifisert 16. september; se
  [migreringsstatus](docs/database-migration-2026-09-16.md).
- [ ] Godkjent deploy og funksjonell produksjonsverifikasjon av lagring,
  versjonskonflikt og redigering av grendepolygon.

Se [bruk og avgrensninger](docs/map-explorer.md#grender-og-lagrede-polygoner)
og produksjonssjekklisten i README.

## Matrikkel – oppstartsfeil rettet lokalt 15. september 2026

Produksjonsdiagnosen viste at funksjonskallet ble sendt til `/admin/login`
(`307`), og at innloggingssidens `200` feilaktig ble tolket som startet jobb.
Kjøringen ble derfor stående før første oppslag, uten funksjonslogg.

- [x] Unnta bare `/.netlify/functions/matrikkel-sync-background` fra
  nettleserinnlogging; behold jobbhemmelighet, POST-krav og validering av jobb-ID.
- [x] Avvis omdirigeringer, godta bare `202` og begrens oppstartskallet til
  10 sekunder. Bruk samme kontroll ved videresending til neste worker.
- [x] Lagre synlig feilstatus ved avvist/ubekreftet oppstart dersom kjøringen
  fortsatt venter. Behold samtidig start/stopp og snapshot; ikke fall tilbake
  til langvarig nettleserbehandling i produksjon.
- [x] Logg oppstart, avslutning, avvist jobbhemmelighet og videresendingsfeil
  med jobbmetadata, uten medlemsopplysninger eller hemmeligheter.
- [x] Regresjonstester for faktisk Next-matcher, `200`/redirect/timeout,
  feilkonfigurasjon, jobbhemmelighet, videresending og samtidige statusendringer.
  Eksterne kall og database er simulert; ingen nye npm-pakker eller migrering.
- [x] Søk og velg ett konkret medlem for Matrikkel-oppdatering. Kjøringen
  avgrenses på medlems-ID, tar samme atomiske snapshot som fullkjøringen og
  kan åpnes direkte fra medlemsdetaljene når administrator har begge roller.
  Ingen ny databasemigrering eller miljøvariabel.
- [ ] Etter godkjent deploy: kjør bare **Test H-nummer 25** først, og verifiser
  både faktisk behandlingsstart i databasen og funksjonsloggen. `202` alene er
  ikke bevis på behandling. Se produksjonssjekklisten i README.
- [x] Overvåking implementert lokalt: `background-watchdog` kontrollerer
  oppdrag uten oppstart og utløpte reservasjoner hvert femte minutt, med høyst
  tre gjenopptakinger før synlig feil. Reelle Postgres-tester dekker samtidighet.
  Databasemigreringen er utført; aktivering og faktisk plattformkjøring må
  fortsatt verifiseres etter godkjent deploy.
- [x] Survey-e-postjobben har samme eksakte proxy-unntak, POST-/hemmelighetskontroll,
  timeout og krav om direkte `202`. Ubekreftet oppstart gir synlig feilstatus.
  Begge workers kan nå lastes i ren Node uten å laste Next/Auth ved oppstart.

## Kart og registerkontroll – implementert MVP 15. september 2026

Se [kartmodulens dokumentasjon](docs/map-explorer.md) for verifiserte kilder,
tilgang, testdekning og kjente begrensninger. Ingen automatisk registerretting.

- [x] Steg 1: Leaflet-kart ved Turufjell, ett GeoJSON-polygon, tegning,
  redigering/sletting, koordinatkontroller for tastatur og areal med Turf.
- [x] Steg 2: Åpent Kartverket-adressesøk via beskyttet Node-proxy,
  paginering, eksakt polygonfiltrering, adressepunkter, sortering og søk.
- [x] Steg 3: Matrikkelreferanser og adresseplasseringer fra åpne data.
  Ukjent seksjonsnummer beholdes som ukjent; ikke komplettert fra eierdata.
- [x] Steg 4: Utskiftbar Overpass-adapter for supplerende veier/stier,
  klippet geometri, lengde i polygon og aggregering av kompatible segmenter.
- [x] Steg 5: Separat registersammenligning med fem statuser, flere kandidater,
  konfliktverdier, manglende gnr/bnr, nøkkeltall og tydelig kildeansvar.
- [x] Fjernet kartmodulens CSV-/GeoJSON- og kopieringsknapper med tilhørende
  klient-, API-, service- og testkode etter produktbeslutning 16. september.
- [x] Enhets-/rutetester med mocket database og eksterne karttjenester.
- [x] Steg 6, eiendomsgrenser: Åpen WFS/GML-adapter med UTM32-transformasjon,
  flere flater/hull, alle matrikkelreferanser og kontrollert fullstendighet.
  Separate tellekall før/etter; avkortede eller for store uttrekk avvises.
  Kartlag, tabell, detaljer og tester; liten reell kildekontroll bestod.
- [x] Flyttet **Søkepolygon** øverst. Valg av entydig adresse/eiendom/teig åpner
  medlemsregisterets detaljpanel med automatisk lagring; ingen hjemmelshaver og
  flere mulige registerposter vises uten at systemet gjetter.
- [x] Nye tomter forsøkes automatisk koblet til én kontrollert grend via eksakt
  Kartverket-adresse og punkt-i-polygon. Fuzzy treff, overlapp og tjenestefeil
  gir ingen automatisk kobling og blokkerer ikke opprettelsen. Ingen migrering.
- [x] Teiger uten offisiell adresse hentes nå uavhengig av adresse-API-et.
  Enheter uten registrert kartgeometri er ikke dekket; dette er dokumentert.
- [x] NVDB v4 er vurdert. Behold utskiftbar Overpass-adapter for små
  administratoruttrekk; begrunnelse og offisiell dokumentasjon i kartveiledningen.
- [ ] Avklar driftsløsning/avtale ved større bruk av veidata.
  Overpass er supplerende og kan ha både tjenestefeil og manglende veigeometri.
- [x] Ukjent plassering vises separat og teller ikke som manglende kartdata.
  Kjente punkter utenfor utelates; teigkobling merkes som berøring av området,
  ikke bevist adresseplassering. Samme avgrensning gjelder nøkkeltall.
- [ ] Verifiser reell Entra-rolle, delt rate-limit og kart-/medlemskobling etter
  publisering med godkjent testgrunnlag; se README. Ingen produksjonsendring er
  utført som del av implementeringen.
- [x] Varige Playwright-tester i isolert miljø med syntetisk register, desktop,
  mobil, tastatur, polygontegning/redigering/sletting, avbryt/redigering under
  lasting og medlemskobling. Karttjenester er mocket; ingen reelle kartkall.

## P1 – Prioritet / bør gjøres først

Dette er oppgaver som enten reduserer teknisk risiko, styrker kvaliteten eller legger grunnlaget for funksjonalitet som andre oppgaver er avhengige av.

### Test

- [x] **API-tester**

  **Status: Rutetester implementert.** Alle 37 rutefiler under `app/api` og
  `app/survey/api` er representert i testpakken. Eksterne tjenester er erstattet
  med testdobler. Postgres- og nettlesertester er nå også etablert. Fullt OAuth-forløp
  og plattformverifikasjon gjenstår;
  dette er ikke det samme som full integrasjonsdekning. Se oversikten i
  `docs/quality-review.md`. Prompten nedenfor beholdes som akseptansekriterier.

  **Prompt:**

  > Gå gjennom alle API-rutene under `app/api/*` og etabler automatiserte tester for disse.
  >
  > Testene skal minimum dekke:
  >
  > * forventet respons ved gyldige kall
  > * validering av input
  > * manglende obligatoriske parametere
  > * ugyldige data
  > * autentisering og autorisasjon der dette brukes
  > * utløpte eller ugyldige tokens
  > * rate limiting der dette er relevant
  > * databasefeil og andre forventede feilsituasjoner
  > * korrekte HTTP-statuskoder
  > * at sensitiv informasjon ikke eksponeres i feilmeldinger
  >
  > Bruk eksisterende testverktøy og mønstre i prosjektet der dette finnes. Ikke endre produksjonskode med mindre det er nødvendig for å gjøre koden testbar.
  >
  > Lag til slutt en kort oversikt over hvilke API-ruter som er dekket og eventuelle områder som fortsatt mangler testdekning.

---

- [x] **Tester for Matrikkel-synkronisering**

  **Status: Enhetstester implementert** i `tests/matrikkel-sync.test.mjs`.
  Feil ved samtidig kansellering og desimal batchstørrelse er rettet etter
  dokumentasjon av funn. Reelle transaksjoner, samtidighet og gjenopptakelse etter
  worker-krasj er nå også dekket med isolert Postgres; ekstern deploytest gjenstår.

  **Prompt:**

  > Lag en grundig testpakke for `lib/matrikkel-sync.js`.
  >
  > Analyser først hele synkroniseringsflyten og identifiser alle viktige scenarier og edge cases.
  >
  > Test minimum:
  >
  > * nye eiendommer
  > * eksisterende eiendommer
  > * endrede eiendomsdata
  > * manglende eller ufullstendige data
  > * duplikater
  > * slettede eller ikke lenger tilgjengelige objekter dersom dette håndteres
  > * feil fra eksterne tjenester
  > * databasefeil
  > * delvis gjennomført synkronisering
  > * idempotens: samme datasett skal kunne behandles flere ganger uten uønskede sideeffekter
  >
  > Mock eksterne tjenester og database der dette er hensiktsmessig.
  >
  > Ikke endre synkroniseringslogikken med mindre du avdekker en konkret feil. Hvis du finner feil eller risikoområder, dokumenter disse separat før eventuell endring.

---

### GitHub Actions / CI

- [x] **Etabler og dokumenter GitHub Actions / CI**

  **Status: Eksisterende CI er gjennomgått og beholdt.**
  `.github/workflows/ci.yml` fantes allerede og kjører `npm ci` og `npm run check`
  (lint, tester, bygg) med Node fra `.nvmrc` og npm-cache. Triggeren er nå pull
  request og push til `main`, for å unngå doble kjøringer på arbeidsgrener.

  GitHub Actions er ikke nødvendig for Netlify-deploy, men gir prosjektet en egen
  kvalitetskontroll før innfletting. Netlify kjører i dag bare `npm run build`.
  **Gjenstår i GitHub:** Kontroller/aktiver påkrevd `quality`-status og PR-krav for
  `main`. Dette er ikke automatisk konfigurert av workflow-filen og er ikke endret
  eksternt. Netlify venter ikke automatisk på Actions ved direkte push til `main`.

  **Prompt:**

  > Etabler en enkel og robust GitHub Actions-pipeline for prosjektet.
  >
  > Pipeline skal kjøre automatisk ved pull request og push til relevante branches.
  >
  > Den skal minimum:
  >
  > * installere dependencies med låst dependency-versjon
  > * kjøre lint
  > * kjøre automatiserte tester
  > * bygge applikasjonen
  > * feile dersom noen av disse stegene feiler
  >
  > Bruk en støttet Node.js LTS-versjon og cache npm-dependencies dersom det er hensiktsmessig.
  >
  > Ikke implementer automatisk produksjonsdeploy med mindre prosjektets eksisterende deployoppsett klart tilsier dette.
  >
  > Sørg for at secrets aldri hardkodes i workflow-filene.
  >
  > Dokumenter kort hvordan workflowen fungerer.

---

### Medlemsregister

- [x] **Medlemsstatus per tomt**

  **Status: Implementert lokalt.** `membership_status` har `member` som trygg
  standard og `exempt` som eksplisitt unntak. Admin kan endre og filtrere;
  eksport, survey-tilgang og e-postutvalg kontrollerer status. Køen kontrollerer
  på nytt før sending. Grunnlaget skal også brukes av nyhetsbrevmodulen.

  De fleste tomter skal være ordinære medlemmer av Turufjell vel, men enkelte tomter skal kunne unntas, for eksempel tomter eid av Turufjell AS.

  **Prompt:**

  > Legg til medlemsstatus på tomtenivå.
  >
  > Standard skal være at en tomt regnes som «vanlig medlem».
  >
  > Administrator skal kunne fjerne denne statusen for enkelte tomter, eksempelvis tomter som eies av Turufjell AS og ikke skal behandles som ordinære medlemmer.
  >
  > Vurder om feltet bør modelleres som:
  >
  > * boolean `isMember`
  > * eller en medlemskategori/status dersom det er sannsynlig at vi får flere medlemstyper senere
  >
  > Velg den løsningen som gir best langsiktig modell uten å gjøre systemet unødvendig komplisert.
  >
  > Medlemsstatus skal kunne brukes i:
  >
  > * filtrering
  > * telling/statistikk
  > * e-postutvalg
  > * undersøkelser
  > * nyhetsbrev
  >
  > Eksisterende tomter skal migreres på en trygg måte.
  >
  > Legg til tester.

---

- [x] **Samlet e-post når samme e-postadresse brukes på flere tomter**

  **Status: Implementert lokalt.** Én engangslenke per normalisert hoved-e-post,
  med atomisk deduplisering av samtidige forespørsler. Lenken har et serverbestemt
  tomteutvalg, kontrollert mot gjeldende hovedkontakt ved bruk. Tomtevelger vises
  bare ved flere tomter. Ekstra e-post gir ikke ny selvbetjeningstilgang.
  Overførte/slettede tomter og manipulerte ID-er avvises. Integrasjonstester.

  Samme person kan være registrert på flere tomter med samme e-postadresse.

  **Prompt:**

  > Endre utsending av personlig medlemslenke slik at en person som har samme e-postadresse registrert på flere tomter, ikke mottar én separat e-post per tomt.
  >
  > Personen skal i stedet motta én samlet e-post.
  >
  > Etter åpning av den personlige lenken skal brukeren kunne se alle tomtene vedkommende har tilgang til.
  >
  > Ta hensyn til:
  >
  > * sikker tokenhåndtering
  > * at tilgang kun gis til tomter knyttet til den aktuelle e-postadressen
  > * utløpstid
  > * eksisterende rate limiting
  > * at en e-postadresse kan være knyttet til både én og flere tomter
  >
  > Eksisterende funksjonalitet for brukere med kun én tomt skal fortsatt fungere enkelt og uten unødvendige ekstra steg.
  >
  > Legg til tester for begge tilfeller.

---

- [x] **Vis gruppering når samme e-postadresse tilhører flere tomter**

  **Status: Implementert lokalt.** Hoved- og ekstraadresser normaliseres uten
  fuzzy matching. Registeret markerer delte adresser; detaljpanelet viser antall,
  tomter og kontaktpersoner med separate lenker, også på tvers av sideinndeling.

  **Prompt:**

  > Oppdater medlemsregisteret i administrasjonsgrensesnittet slik at det blir tydelig når samme e-postadresse er registrert på flere tomter.
  >
  > Lag en visuell gruppering eller annen intuitiv markering slik at administrator enkelt kan se:
  >
  > * hvilke tomter som deler samme e-postadresse
  > * hvor mange tomter adressen er knyttet til
  > * hvilke personer/navn som eventuelt er registrert på de forskjellige tomtene
  >
  > Det skal fortsatt være mulig å åpne og redigere den enkelte tomt separat.
  >
  > Unngå å slå sammen data som faktisk tilhører forskjellige medlems-/tomteposter.

---

- [x] **Informasjon om personlig lenke**

  **Status: Ferdig.** Forsiden og HTML-e-posten hadde allerede budskapet og riktig
  levetid. Ren tekst-versjonen er supplert med kopier/lim inn-hjelp. Tester bekrefter
  15 minutter, personlig lenke og at den ikke skal videresendes.

  **Prompt:**

  > Gjør det tydelig både på forsiden og i e-posten med personlig lenke at lenken er personlig og kun varer i 15 minutter.
  >
  > Bruk følgende budskap eller en språklig forbedret variant:
  >
  > «Lenken er personlig, varer i 15 minutter og skal ikke videresendes.»
  >
  > I e-posten skal det i tillegg stå:
  >
  > «Hvis knappen ikke virker, kan du kopiere adressen nedenfor og lime den inn i nettleseren.»
  >
  > Sørg for at teksten er lett synlig uten å virke unødvendig dramatisk.
  >
  > Ikke endre faktisk tokenlevetid med mindre den i dag ikke er 15 minutter.

---

- [x] **Kommentar ved endring av medlemsopplysninger**

  **Status: Implementert lokalt.** Valgfri kommentar på høyst 2000 tegn følger
  rettingen/eierskiftet. Den vises som ren tekst i oppgaveliste og medlemshistorikk.
  Administrator kan kvittere lest uten å slette historikk. Audit-triggere og
  faktisk lagring er testet i isolert Postgres; eksisterende direkte retting beholdes.

  **Prompt:**

  > Utvid funksjonen for endring av medlemsopplysninger slik at medlemmet kan legge ved en valgfri kommentar til endringsforslaget.
  >
  > Kommentaren skal:
  >
  > * lagres sammen med endringsforslaget
  > * være synlig for administrator
  > * vises i oppgavelisten
  > * inngå i endringshistorikken
  >
  > Når et endringsforslag inneholder kommentar, skal dette fremgå tydelig i oppgavelisten.
  >
  > Kommentar skal valideres og ha en rimelig maksimal lengde.
  >
  > Vis aldri kommentaren som HTML.
  >
  > Legg til nødvendige tester.

---

- [x] **Reservasjon mot deling med Turufjell AS**

  Reservasjonen er en avkrysning per tomt, synlig og redigerbar for medlem og
  administrator. Eksisterende poster er som standard ikke reservert. Endringstid
  lagres og endringen inngår i eksisterende audit-/profilhistorikk. Filteret kan
  finne begge grupper, og Excel-eksport utelater reserverte poster som standard;
  administrator må aktivt slå av dette bare for intern bruk i Turufjell Vel.

  **Prompt:**

  > Implementer en funksjon der medlemmet kan reservere seg mot at kontaktinformasjon deles eller utveksles med Turufjell AS.
  >
  > Før implementasjon skal du undersøke eksisterende datamodell og hvordan personopplysninger brukes i systemet.
  >
  > Funksjonen skal:
  >
  > * være tydelig formulert for medlemmet
  > * lagres med tidspunkt for siste endring
  > * kunne endres senere av medlemmet
  > * være synlig for administrator
  > * kunne brukes som filter ved eksport eller utvalg av medlemmer
  >
  > Standardverdien må ikke endres uten at eksisterende praksis og krav er avklart.
  >
  > Registrer også endringen i relevant endringshistorikk/audit-logg.
  >
  > Legg til tester.

---

### Nye P1-punkter fra kvalitetsgjennomgangen

- [x] **Integrasjonstester mot isolert Postgres:** Lokale tester er etablert
  med syntetiske data, uten tilgang til Neon-produksjon. Migrering to ganger,
  audit-aktør, engangslenker, samtidige survey-svar, endret spørsmålsversjon og
  samtidig Matrikkel-stopp/arbeid, verifiseringshash og lagringsnøkler er testet.
  CI bruker en separat Postgres-container.
- [x] Neon-schema-only-verifikasjon før produksjonsmigrering, utført
  15. september 2026 mot produksjonens eksisterende skjema med bare syntetiske
  data. Gjentatt migrering, databevaring, nye felt/tabeller og audit-vern bestod.
- [x] Ferskt gjenopprettingspunkt opprettet umiddelbart før produksjonsmigrering.
  Snapshot utløper 22. september 2026 kl. 21:50 UTC.
  Se [migreringsstatus](docs/database-migration-2026-09-15.md).
- [x] Produksjonsmigrering kjørt etter eksplisitt godkjenning 15. september
  2026 kl. 21:50 UTC. Radantall og kontrollsummer for eksisterende kolonner
  er uendret i alle 23 opprinnelige tabeller; nye skjemaobjekter er verifisert.
- [x] **Gjenopptakelse etter avbrutt worker:** Implementert tidsbegrenset
  reservasjon, maksimalt tre behandlingsforsøk og beskyttelse mot gammel worker.
  Ekte transaksjonstester dekker gjenopptaking, dobbel kjøring, stopp, samtidig
  manuell godkjenning og loggskjuling med varig aktørlogg.
- [ ] **Brukerloggens integritet og lagringstid:** Vurder append-only-beskyttelse
  og databaseprivilegier for `audit_log`, samt kontrollert sletting etter
  avklart lagringstid. UPDATE/DELETE/TRUNCATE-beskyttelse er testet på isolert
  Neon-gren, og triggerne er verifisert aktive i produksjon. Separat
  runtime-/vedlikeholdsrolle og lagringstid gjenstår;
  skjemaeier kan deaktivere triggere, og ingen automatisk sletting er innført.
- [ ] **GitHub-grenbeskyttelse:** Verifiser påkrevd `quality`-sjekk og PR-krav på
  `main`, slik at kvalitetskontrollen faktisk stopper dårlige endringer før
  Netlify publiserer. Ekstern innstilling, ikke utført i denne gjennomgangen.

---

## P2 – Neste steg

Dette er viktige funksjoner som bygger videre på medlemsregisteret og prosjektets grunnstruktur.

### Test

- [x] **UI-tester**

  **Status: Implementert lokalt.** Playwright kjører isolert appkopi uten `.env`
  eller produksjonstilgang. 14 scenarier på desktop/mobil dekker survey,
  medlemsinngang/-profil, oppgaveliste, registerpanel, brukerlogg, CMS,
  grupper, nyhetsbrev, survey-e-post og kart. Tastatur/fokus, validering,
  utløpt økt, versjonskonflikt, lagringsfeil, retry og avbrutt lasting er med.
  Test-fixtures finnes bare i den midlertidige appkopien, aldri i produksjonsbygget.
  Dette er prioritert regresjonsdekning, ikke full E2E mot Entra, Neon og
  e-postleverandør. Se `docs/quality-review.md` for avgrensning.

  **Prompt:**

  > Kartlegg React-komponentene i prosjektet og etabler et hensiktsmessig nivå av automatiserte UI-/komponenttester.
  >
  > Prioriter komponenter som:
  >
  > * inneholder brukerinput
  > * endrer data
  > * viser medlemsinformasjon
  > * håndterer innlogging eller personlige lenker
  > * brukes i administrasjonsgrensesnittet
  > * har kompleks tilstand eller betinget rendering
  >
  > Test både normal bruk og relevante feilsituasjoner.
  >
  > Ikke lag tester kun for å øke coverage-tallet. Prioriter tester som beskytter faktisk funksjonalitet mot regresjoner.
  >
  > Oppsummer til slutt hvilke komponenter som er testet, hvilke som ikke er testet, og hvilke områder som bør prioriteres videre.

---

### Medlemsregister

- [x] **Søk i brukerendringer**

  **Status: Funksjonen implementert.** Brukerloggen har søk i navn, e-post,
  post-ID og før-/etterverdier, filtre på aktør, område, endringstype, status og
  datointervall, samt rettet telling og sideinndeling. Datovalidering og bundne
  SQL-parametere er testet. Ingen ny API-rute er nødvendig; den eksisterende
  serversiden behandler søket.

  **Målt lokalt:** 100 000 syntetiske loggposter: friteksttelling ca. 140 ms,
  vanlig søk side 25 ca. 12 ms, aktør/dato ca. 0,3 ms. Dagens indekser beholdes;
  ingen ekstra søkeindeks eller endret pagineringsmodell er nødvendig på dette
  testgrunnlaget. Reproduserbart rollback-skript og begrensninger i kvalitetsrapporten.
  Neon-produksjonsytelse og millionmengder er ikke verifisert.

  **Prompt:**

  > Implementer søk og filtrering i historikken over brukerendringer.
  >
  > Administrator skal kunne søke etter relevante endringer basert på tilgjengelige data, eksempelvis:
  >
  > * navn
  > * e-postadresse
  > * medlems-/tomteinformasjon
  > * endringstype
  > * status
  > * dato eller datointervall
  >
  > Bruk eksisterende datamodell og designsystem.
  >
  > Søk skal skje effektivt også dersom antallet endringer blir betydelig større enn i dag.
  >
  > Legg til nødvendige API-endringer, validering og tester.

---

- [x] **Grender**

  **Status: Implementert lokalt.** Oppretting, navneendring, tilordning/flytting,
  registerfilter og telling av tomter/medlemmer. Datamodellen gir høyst én grend
  per tomt. Samtidige flyttinger og sletting uten tap av medlemmer er testet.

  **Prompt:**

  > Implementer støtte for å knytte tomter til en «grend».
  >
  > En grend skal være en administrerbar gruppering av tomter.
  >
  > Administrator skal kunne:
  >
  > * opprette en grend
  > * endre navn på en grend
  > * legge én eller flere tomter til en grend
  > * flytte tomter mellom grender
  > * filtrere medlemsregisteret på grend
  > * se antall tomter og medlemmer per grend
  >
  > En tomt skal i utgangspunktet tilhøre maksimalt én grend.
  >
  > Ikke hardkod grendene i kildekoden.
  >
  > Legg til databaseendringer, API, frontend og tester.

---

- [x] **E-postgrupper**

  **Status: Implementert lokalt.** Administrasjon på `/admin/members/groups`,
  enkeltutvalg eller alle søketreff, navneendring, fjerning og trygg sletting.
  Koblingstabellen dupliserer ingen kontaktdata. Unike e-poster for ordinære
  medlemmer telles. API-, Postgres- og nettlesertester på desktop/mobil.

  **Prompt:**

  > Implementer administrerbare e-postgrupper i medlemsregisteret.
  >
  > Administrator skal kunne:
  >
  > * markere én, flere eller alle relevante medlems-/tomteposter
  > * opprette en ny gruppe basert på utvalget
  > * legge medlemmer til eksisterende gruppe
  > * fjerne medlemmer fra en gruppe
  > * endre gruppens navn
  > * slette en gruppe uten å slette medlemsdata
  > * se hvor mange unike e-postadresser gruppen inneholder
  >
  > Samme e-postadresse skal ikke få flere kopier av samme utsending bare fordi adressen finnes på flere tomter.
  >
  > Gruppene skal senere kunne benyttes av nyhetsbrevmodulen.
  >
  > Design datamodellen slik at gruppemedlemskap og medlemsregisteret ikke dupliserer persondata unødvendig.
  >
  > Legg til API, UI og tester.

---

### CMS

- [x] **Rikteksteditor for artikler**

  **Status: Implementert lokalt.** Tiptap med begrenset JSON-format, sanitering
  på serveren og trygg React-rendering, uten fri HTML. Avsnitt, H2/H3, fet/kursiv,
  lister, sitater og lenker støttes. Gammel tekst vises fortsatt bokstavelig.
  Enhets-, Postgres- og nettlesertester dekker sanitering, formatering og lagring.

  **Prompt:**

  > Implementer en enkel rikteksteditor for CMS-artikler.
  >
  > Støtt minimum:
  >
  > * avsnitt
  > * overskrifter
  > * fet tekst
  > * kursiv
  > * punktlister
  > * nummererte lister
  > * lenker
  >
  > Vurder i tillegg om blokksitat er hensiktsmessig.
  >
  > Ikke legg til støtte for:
  >
  > * fontvalg
  > * skriftstørrelser
  > * egendefinerte farger
  > * fri HTML
  > * avansert layout
  >
  > Innholdet skal følge nettstedets eksisterende typografi og design.
  >
  > Velg et godt vedlikeholdt React-kompatibelt editorbibliotek dersom det er hensiktsmessig.
  >
  > Riktekstinnhold skal saniteres for å unngå XSS.
  >
  > Eksisterende artikler må fortsatt kunne vises.
  >
  > Legg til relevante tester.

---

### Applikasjon

- [x] **Favicon**

  **Status: Implementert lokalt.** Eksakt grafisk SVG-del gjenbrukes til PNG
  via Next ImageResponse: 64 px nettleserikon og 180 px Apple-ikon, med universell
  lys bakgrunn. Resten av profileringen er uendret. Tidligere ikon er bevart
  som `public/turufjell-vel-legacy-icon.png`. Generert ikon og bygg er kontrollert.

  **Prompt:**

  > Oppdater favicon for applikasjonen slik at det benytter den grafiske delen av Turufjell vel-logoen.
  >
  > Undersøk hvordan favicon fungerer i nettlesere med både lyst og mørkt brukergrensesnitt.
  >
  > Målet er at logoen skal være tydelig og gjenkjennelig i begge tilfeller.
  >
  > Vurder om vi bør:
  >
  > * bruke én universell favicon med lys bakgrunn
  > * bruke transparent bakgrunn
  > * tilby egne varianter for lyst og mørkt grensesnitt dersom dette støttes på en robust måte
  >
  > Implementer den løsningen som gir best kompatibilitet på moderne Chrome, Edge, Safari og Firefox.
  >
  > Ikke endre den øvrige logoen eller profileringen.

---

### Brukerlogg og bakgrunnsjobber

- [x] Logg generering av medlems- og resultatseksport med aktør, tidspunkt,
  eksporttype, antall poster, utvalg og undersøkelses-ID. Ingen kopi av innholdet.
- [x] Samlet hendelsesvisning for testmail, kampanjestart/resend og ferdig/feilet
  utsending. `admin_activity_log` gjenbruker tidsstempler med stabile hendelses-ID-er.
  Testmail lagrer bestillende aktør. Mottakere og innhold dupliseres ikke i visningen.
- [x] Registrer aktør ved Matrikkel-stopp, manuell godkjenning og skjuling av
  kjøringsloggen, slik at revisjonssporet beholdes selv om kjøringen skjules.
- [x] Vurdert Entra-innlogging/rollelogg og avvist apptilgang. Behold Entra som
  identitetskilde og eksisterende minimale avvisningshendelser i plattformloggen.
  Medlemmets egeneksport gir nå én minimal `security_events`-hendelse. Ingen rå
  tokens, OAuth-payload eller IP-er er lagt til. Begrunnelse i kvalitetsrapporten.
- [x] Test bakgrunnsfunksjonenes jobbhemmelighet, retry etter timeout, dobbel
  invocation og delvise e-postfeil uten reelle utsendinger. SQL-låsing og avbrutte
  leveringer er testet. Usikker levering etter krasj merkes for kontroll, ikke
  blind ny utsending. Plattformretry må fortsatt verifiseres ved godkjent deploy.

Begrunnelse og sammenligning med GitHub og Microsoft Purview finnes i
`docs/quality-review.md`. Vanlige sidevisninger er ikke del av brukerloggen.

---

## P3 – Backlog / senere

Dette er nyttig funksjonalitet, men den er ikke nødvendig for neste versjon og kan bygges når grunnfunksjonene er stabile.

### Nyhetsbrev

- [x] **Nyhetsbrevkampanjer**

  **Status: Implementert lokalt.** Utkast med riktekst, gruppeutvalg, forhåndsvisning,
  mottakertelling, testmail og separat Netlify-bakgrunnsjobb. Innhold og utvalg
  låses ved oppstart; unike adresser dedupliseres i databasen. Gjeldende medlemsstatus,
  gruppetilknytning og leveringsreservasjoner kontrolleres før sending. Delvise feil,
  parallelle starter og usikker levering er testet uten reell utsending.
  Migreringen er utført; funksjonen må fortsatt verifiseres etter godkjent
  deploy. Se README.

  Avhenger av at e-postgrupper er på plass.

  **Prompt:**

  > Design og implementer en nyhetsbrevmodul som bygger videre på e-postgruppene i medlemsregisteret.
  >
  > Administrator skal kunne:
  >
  > * opprette en ny nyhetsbrevkampanje
  > * angi tittel/emne
  > * skrive innhold
  > * velge én eller flere mottakergrupper
  > * se antall unike mottakere før utsending
  > * forhåndsvise nyhetsbrevet
  > * sende testmail til valgfri adresse
  > * sende kampanjen
  > * se status for utsendingen
  >
  > Systemet skal sørge for at samme e-postadresse kun mottar én kopi av kampanjen selv om adressen finnes i flere valgte grupper eller er knyttet til flere tomter.
  >
  > Lagre minimum:
  >
  > * kampanjen
  > * tidspunkt for utsending
  > * mottakergrunnlag
  > * antall mottakere
  > * status
  > * eventuelle sendefeil
  >
  > Vurder om utsending bør skje i batcher eller via eksisterende kø-/mailmekanisme for å unngå timeout og belastning.
  >
  > Ikke bygg funksjonalitet for markedsføringssporing som åpningspixler eller tredjeparts tracking.
  >
  > Gjenbruk eksisterende e-postinfrastruktur og designmønstre der dette er mulig.
  >
  > Legg til nødvendige tester.

---

### Applikasjon

- [x] **Intern bruksstatistikk – personvernvennlig første nivå**

  Følgende avgrensning er implementert i kode. Databasemigreringen er utført;
  innsamlingen aktiveres først etter godkjent deploy:

  - [x] Dagsaggregater per tillatt sidetype i egen Neon-tabell
  - [x] Grov enhetskategori (`mobile`, `tablet`, `desktop`, `unknown`)
  - [x] Ingen IP, cookie, bruker-/besøks-ID, rå URL/query, referrer eller user-agent
  - [x] Ingen rå hendelseslogg eller personlige medlems-/surveylenker
  - [x] `Do Not Track` respekteres og forespørselen sender ikke cookies
  - [x] Varig historikk i form av anonyme dagsaggregater; ingen rå events beholdes
  - [x] Adminmodul med 7/30/90/365/730 dager og hele perioden
  - [x] Responsiv Visx-graf med dag-, uke- og månedsoppløsning og tilgjengelig tabell
  - [x] Enhets-, API- og databaseintegrasjonstester
  - [x] Additiv produksjonsmigrering utført og verifisert 16. september 2026
  - [ ] Godkjent deploy og funksjonell produksjonsverifikasjon av innsamling,
    tilgangskontroll, periodevalg og graf

  Besøk/sessioner, varighet, navigasjonsforløp, exit-side, nettleser,
  operativsystem og referrer er bevisst ikke implementert. De krever mer
  sammenkobling eller gir upålitelige tall, og skal bare vurderes gjennom en ny
  produkt- og personvernbeslutning.

  Det er ikke ønskelig å bruke Google Analytics eller andre tredjepartstjenester.

  **Prompt:**

  > Design og implementer en enkel, personvernvennlig og egenhostet løsning for bruksstatistikk.
  >
  > Det skal ikke brukes Google Analytics eller andre eksterne analysetjenester.
  >
  > Statistikken skal lagres i vår egen backend og kunne vises i en egen administrasjonsmodul.
  >
  > Aktuelle datapunkter:
  >
  > * nettlesertype
  > * operativsystem når dette kan identifiseres på en rimelig og stabil måte
  > * skjerm-/viewportstørrelse
  > * besøkte sider
  > * tidspunkt for sidevisning
  > * omtrentlig varighet på besøk/session
  > * navigasjon mellom interne sider
  > * referrer når denne er tilgjengelig
  > * hvilken side brukeren forlater løsningen fra, dersom dette kan estimeres pålitelig
  >
  > Før implementasjon:
  >
  > 1. vurder hvilke data som faktisk kan samles inn pålitelig i moderne nettlesere
  > 2. vurder personvernkonsekvenser
  > 3. unngå fingerprinting
  > 4. unngå innsamling av unødvendige personopplysninger
  > 5. vurder nødvendig lagringstid
  >
  > Lag deretter:
  >
  > * backend-endepunkt for mottak av events
  > * egnet datamodell
  > * frontend-instrumentering
  > * administrasjonsside med aggregert statistikk
  >
  > Administrasjonssiden bør minimum kunne vise:
  >
  > * sidevisninger
  > * besøk/sessioner
  > * mest besøkte sider
  > * gjennomsnittlig besøkstid
  > * nettleserfordeling
  > * operativsystem
  > * skjermstørrelser
  > * referrers
  > * utvikling over tid
  >
  > Bruk primært aggregerte data i visningen.
  >
  > Dokumenter hvilke data som registreres og hvorfor.

---

- [x] **Repository-metadata og prosjektfiler**

  **Status: Implementert lokalt.** `.editorconfig`, `CHANGELOG.md`, beskrivelse
  og repository-URL er lagt til. `private: true` beholdes, med `UNLICENSED`;
  ingen åpen lisens, CONTRIBUTING eller CODE_OF_CONDUCT er lagt til for dette
  lille lukkede prosjektet. Foreslåtte GitHub topics er dokumentert i README;
  ingen eksterne repository-innstillinger er endret.

  Repositoryet mangler enkelte standardfiler og metadata.

  `package.json` har `"private": true`, og prosjektet er et lukket prosjekt for Turufjell vel. Det er derfor ikke nødvendigvis ønskelig med en åpen kildekode-lisens.

  **Prompt:**

  > Gjennomgå repositoryet og rydd opp i prosjektmetadata og standardfiler.
  >
  > Gjør følgende:
  >
  > * vurder om det bør finnes en `LICENSE`-fil når prosjektet er privat og ikke skal distribueres som open source
  > * ikke legg til en standard open source-lisens uten eksplisitt grunnlag
  > * legg til en kort og presis repository-beskrivelse der dette kan defineres i prosjektet
  > * foreslå relevante GitHub topics
  > * vurder om `CONTRIBUTING.md` og `CODE_OF_CONDUCT.md` har noen verdi i et lukket prosjekt med svært få utviklere
  > * opprett `.editorconfig`
  > * opprett `CHANGELOG.md` med en enkel struktur som kan brukes videre
  >
  > Ikke legg til filer kun fordi de er vanlige i open source-prosjekter. Tilpass anbefalingene til at dette er en privat produksjonsapplikasjon for Turufjell vel.
  >
  > Oppsummer hva du har lagt til og hva du bevisst har valgt å utelate.

---

## Undersøkelser

Foreløpig ingen definerte utviklingsoppgaver.

---

## Sikkerhet

En separat sikkerhetsgjennomgang og penetrasjonstest basert på repository og kjørende løsning er igangsatt med ekstern part.

**Status:** Enkeltmedlemsvalg er implementert lokalt; funksjonell
produksjonsverifikasjon inngår i den godkjenningspliktige deploykontrollen.

Eventuelle funn fra sikkerhetsgjennomgangen legges inn som egne P1- eller P2-saker når rapporten foreligger.

---

## Ferdig

- [x] Rutetester for alle 37 API-rutefiler, inkludert kart, grupper og nyhetsbrev, med dokumenterte avgrensninger.
- [x] Egen Matrikkel-testpakke for kontrollflyt, feil, batcher og gjentatt behandling.
- [x] Rettet overskriving av stoppet Matrikkel-status og desimaltall i batchgrenser.
- [x] Rettet 400/500 ved manglende roller og tekniske feil; avvis ugyldig JSON
  før adminendringer, slik at ødelagt input ikke starter en full synkronisering.
- [x] Rettet antall treff og sideinndeling i brukerloggen; lagt til søk og filtre.
- [x] Loggført generering av medlems- og resultatseksporter uten eksportinnhold.
- [x] Beholdt og justert eksisterende CI; dokumentert forskjellen fra Netlify.
- [x] Personlig 15-minutterslenke og kopier/lim inn-hjelp i e-post.
- [x] Beskyttet survey-snapshot mot endrede spørsmål mellom visning og lagring:
  klientversjon, API-validering og atomisk SQL-vilkår; medlemmet må laste inn
  nye spørsmål og svare på nytt. Ingen skjemaendring nødvendig.
- [x] Dokumentert resterende testbehov, loggføringsbehov og produksjonskontroller.

---

# Anbefalt rekkefølge

1. [ ] Databaseintegrasjon, worker-gjenopptakelse og GitHub-grenbeskyttelse
2. [x] Samlet tilgang for samme hoved-e-post på flere tomter
3. [x] Medlemsstatus per tomt og visuell gruppering av felles e-post
4. [x] Kommentar ved endringsforslag
5. [x] Reservasjon mot deling med Turufjell AS, med filter og trygg eksportstandard
6. [ ] Brukerloggens integritet, lagringstid og gjenstående administrative hendelser
7. [x] Nettlesertester og tester av bakgrunnsjobber
8. [x] Ytelsestest av søk i store brukerlogger
9. [x] Grender og e-postgrupper
10. [x] CMS rikteksteditor og favicon
11. [ ] Nyhetsbrev, repository-opprydding og bruksstatistikk er implementert;
    godkjent deploy og funksjonell produksjonsverifikasjon gjenstår


###16. sept todo:###
###Oversikt###

- [x] Alle fliser bruker samme ikon som menyen, til høyre for åpne-lenken.

###Oppgaveliste###

- [x] Oppgavelisten viser antall ubehandlede oppgaver i menyen og på flisen. Tallet inkluderer åpne medlemsforespørsler og uleste medlemskommentarer.

###Medlemsregister###

- [x] Filteret er synliggjort med egen bakgrunnsfarge.
- [x] Knapper i adminområdet har tooltip som forklarer handlingen.
- [x] «Mangelfull kontaktinfo» og «Medlemmer med kommentar» er del av filteret.
- [x] Matrikkeloppdatering kan startes for avkryssede medlemmer, tilsvarende utvalget for Excel-eksport.
- [x] Nyhetsbrev er et eget menyvalg til venstre.
- [x] Detaljpanelene for medlemmer, undersøkelser og nettsider lagrer eksisterende poster automatisk og viser lagringsstatus i sticky topp. Opprettelse, publisering og sletting er fortsatt eksplisitt.
- [x] H-nummer, gårds- og bruksnummer og seksjonsnummer ligger på én linje på større skjermer.
- [x] Kartvisningen ligger under tinglysningsdato.
- [x] Hjemmelshaver og tinglysningsdato ligger på samme linje på større skjermer.

###kart og registerkontroll###

- [x] Valg av grend i nedtrekkslisten og i kartet utfører samme handling.
- [x] Feltene for ny grend skjules til «Ny grend» velges.
- [x] Søkepolygon ligger i en egen, kollapset seksjon som kan ekspanderes.
- [x] Når en lagret grend velges, hentes adresser og eiendommer innenfor polygonet automatisk. Eiendommer kan vises eller skjules som eget kartlag.
- [x] Et kontrollert grendepolygon kan kobles til medlemsregisteret. Bare entydige offisielle treff får grend; eksisterende tilordning til en annen grend beholdes for manuell kontroll.

### Forsidekart

- [x] Forsiden viser alle kontrollerte grendepolygoner med én knapp per grend.
- [x] Ingen grend er valgt ved innlasting; samme knapp velger eller opphever
  valget.
- [x] Eiendommer kan vises for valgt grend. Under kartet vises bare H-nummer,
  gårds-/bruksnummer og adresse; navn, e-post, telefon og interne database-ID-er
  sendes aldri til den offentlige klienten. Eiendomslisten avgrenses med lagret
  `members.hamlet_id`; Kartverket brukes bare til kartplassering.
- [x] Klikk på eiendomsmarkør eller tabellrad velger objektet og zoomer kartet.
- [x] Engangsverktøy for å beregne alle grender samlet, avvise overlapp og lagre
  sikre koblinger med miljølås, polygonversjonskontroll og audit.
- [x] Produksjonskjøring 16.09.2026: 424 av 428 aktive tomter ble koblet entydig
  til 11 kontrollerte grender. Ingen overlapp eller konflikter ble funnet; 4
  tomter står ukoblet for manuell kontroll.
- [x] Alle ordinære grendefiltre og -visninger bruker lagret `members.hamlet_id`.
  Gjentatt polygonkobling er fjernet fra adminkartet; fri polygonkontroll er
  fortsatt tilgjengelig som et separat datakvalitetsverktøy.
- [x] Medlemsfilteret har valget **Uten grend** for manuell gjennomgang av de
  fire tomtene som ikke fikk et entydig sikkert treff.

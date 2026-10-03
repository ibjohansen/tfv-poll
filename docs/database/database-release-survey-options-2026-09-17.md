# Produksjonssetting – svaralternativer og mottakere

Utført **17. september 2026** etter eksplisitt godkjenning av
produksjonsmigrering og Netlify-deploy. Alle klokkeslett nedenfor er UTC
(legg til to timer for norsk sommertid).

## Resultat

- Migreringen er fullført, og eksisterende data i 14 kontrollerte tabeller
  er bevart. Ingen medlemsdata, svar eller leveranser er slettet.
- Publisert Netlify-deploy: `6aac3836c6d9797f210602a5`,
  `ready/production`, **18:59:09 UTC**.
- Produksjonsadresse: <https://medlemsservice.turufjellvel.no>.
- Den midlertidige skrivesperren er fjernet. Undersøkelsenes åpen/stengt-status
  er uendret. Ingen invitasjoner eller kvitteringer ble sendt under arbeidet.
- Ingen Netlify-miljøvariabler, Entra-innstillinger, `.env.local` eller
  GitHub-referanser ble endret. Kilden er **ikke committet eller pushet** i
  denne runden; dette må gjøres etter egen godkjenning før neste Git-deploy.

## Forberedelse og gjenopprettingspunkt

Migreringen var på forhånd kjørt gjentatte ganger med syntetiske data på
en isolert schema-only-gren. **57 Postgres-integrasjonstester** bestod;
se [testrapporten](database-test-survey-options-2026-09-17.md).
Driftsskriptets midlertidige sperre og gjenåpning ble også prøvd der før
produksjonskjøringen. Ingen aktive eller ventende utsendelses-/Matrikkeljobber
ble funnet ved produksjonskontrollen.

- Neon-prosjekt: `ancient-wildflower-97748936`.
- Produksjonsgren: `br-misty-paper-b2tequav`.
- Verifisert databasemarkør: `production`.
- Gjenopprettingspunkt: `snap-flat-bread-b2jyli5k`, navn
  `pre-survey-options-20260917`, opprettet **18:42:09 UTC**.
- Utløp for gjenopprettingspunktet: **24. september 2026 kl. 22:00 UTC**
  (midnatt til 25. september norsk tid).

Testet og migrert `database/schema.sql`, SHA-256:

```text
adeb87b2b28839172a77e7fcf85e74094ff08ead1d3bfc39712e8f143a5d5a28
```

Forbindelsen ble gitt direkte til migreringsprosessen i minnet med TLS og
kontroll av nøyaktig endepunkt/database. Ingen forbindelse eller hemmelighet
ble skrevet i rapporten, til en ny miljøfil eller i kommandolinjeargumenter.

## Migrering og datakontroll

`scripts/release-survey-schema.mjs` låste relevante tabeller, kontrollerte
at jobber var avsluttet, installerte en midlertidig skrivesperre og anvendte
det testede skjemaet i én transaksjon. Antall og samlet kontrollsum over alle
allerede eksisterende kolonner ble sammenlignet før og etter. Bare aggregater,
ikke medlemsrader eller kontakteksporter, ble hentet ut til kontrollen.

Migrering og skrivesperre ble bekreftet **18:44:44 UTC**. Syv midlertidige
triggere beskyttet undersøkelsessvar, invitasjoner, økter og utsendelseskøer
mot gammel kode mens den nye serverkoden ble publisert. Sperren ble kontrollert
fra en ny transaksjon og fjernet **18:50:03 UTC**, etter første publisering av
den kompatible serverkoden. Alle syv triggere og den midlertidige funksjonen
er fjernet; ingen permanent vedlikeholdsmodus gjenstår.

| Kontrollert tabell | Rader før og etter migreringen |
| --- | ---: |
| `members` | 429 (428 aktive) |
| `surveys` | 3 (1 åpen) |
| `survey_responses` | 7 |
| `survey_access_tokens` | 6 |
| `survey_sessions` | 5 |
| `email_campaigns` | 1 |
| `email_deliveries` | 76 |
| `newsletter_campaigns` | 0 |
| `survey_attachments` | 0 |
| `cms_pages` | 3 |
| `cms_attachments` | 17 |
| `member_hamlets` | 12 |
| `member_email_groups` | 2 |
| `member_email_group_members` | 6 |

Etterkontrollen fant alle tre nye unike indekser, ingen av de tre erstattede
indeksene og ingen ugyldige indekser. Alle syv eldre svar har
`response_key=property` og uendret historisk innhold. Kvitteringsutboksen
var tom, og singleton-raden for kvitteringsarbeideren var opprettet.
Den eksisterende kampanjen var avsluttet med 70 sendte og 6 feilede leveranser;
ingen av dem ble forsøkt sendt igjen.

## Publiseringsfeil og rettelse

Første deploy, `6aac35c2ef33920817a14d41`, ble publisert **18:49:02 UTC**.
Serverfunksjonene svarte, men separat `netlify build` og
`netlify deploy --no-build` publiserte feil statisk mappe. Etterkontrollen
fant HTTP 404 for JavaScript-filene. HTML-kontrollen alene var derfor ikke
tilstrekkelig; brukergrensesnittet kunne ikke lastes normalt i perioden
**18:49–18:59 UTC**.

Netlifys Next-adapter 5.16 flytter statiske filer inn i `.next` under
publisering og tilbake til `.netlify/static` etter bygg. En separat
`--no-build`-publisering mot `.next` hopper over denne flyttingen. Rettelsen
var en fullstendig `netlify deploy --prod --build` fra samme rene byggmappe,
med alle server-/bakgrunnsfunksjoner og edge-funksjoner. Ingen ny migrering
eller tilbakeføring av databaseinnhold var nødvendig.

Byggmappen inneholdt ingen `.env`-filer. Alle seks funksjonspakker ble kontrollert
for lokale miljøfiler og hemmeligheter, uten funn. To stikkprøver av interne
server-/konfigurasjonsstier krevde innlogging også på den erstattede deployen.
CLI 27.8.0 og Next-adapter 5.16.0 ble benyttet.

## Verifikasjon

- [x] `npm run check`: 317 enhetstester, lint og produksjonsbygg bestått.
  Lokal sjekk brukte tomme databasevariabler og deaktivert e-post; forventede
  meldinger om manglende database ved cachefylling var ikke byggfeil.
- [x] `npm audit`: ingen kjente sårbarheter. Driftsskriptet bestod egen lint.
- [x] `git diff --check`: bestått.
- [x] Seks JavaScript-filer og to CSS-filer fra forsiden svarte HTTP 200 og
  var SHA-256-identiske med det publiserte bygget. Et karusellbilde svarte 200.
- [x] `/survey` svarte 200, `/admin` sendte uinnlogget bruker til innlogging,
  og undersøkelses-/utsendelses-API svarte 401 uten autentisering.
- [x] Isolert Chrome-kontroll: karusell og kart lastet, valg av Høgsetra
  aktiverte eiendomsvisning, og eiendoms-API svarte 200. Ingen ødelagte lastede
  bilder eller konsollfeil ble funnet i denne kontrollen.
- [x] Netlify rapporterte alle seks server-/bakgrunnsfunksjoner i deployen.
  Byggmanifestet har `background-watchdog` med `*/5 * * * *`.
- [ ] Bekreft faktisk planlagt worker-kjøring i Netlifys funksjonslogg.
- [ ] Innlogget funksjonskontroll av spørsmål, mottakervalg, kopiering og
  tillegg av mottakere på produksjon.
- [ ] Kontroller ekte invitasjon/kvittering og første-svar-regelen med
  godkjente testmottakere. Ingen produksjonsmail ble sendt for å teste dette.
- [ ] Commit og push de publiserte kildeendringene etter egen godkjenning.

De 44 isolerte nettlesertestene og fire ekstra regresjonstester fra utviklingen
er dokumentert i funksjonsbeskrivelsen; de ble ikke kjørt på nytt mot ekte
produksjonsdata. Nettlesersjekken over er en separat, begrenset røykprøve.

## Tilbakeføring

**Ikke publiser gammel svarkode mot det nye skjemaet.** Etter uavhengige svar
kan flere tellende besvarelser tilhøre samme tomt. Ikke gjenopprett gammel
unik indeks ved å slette svar, og ikke gjenopprett snapshot automatisk:
nye data etter gjenåpningen må først avstemmes. Eventuell databasegjenoppretting
krever egen godkjenning og koordinering med en kompatibel applikasjonsversjon.
Den mislykkede statiske deployen er ikke et anbefalt tilbakeføringsmål.

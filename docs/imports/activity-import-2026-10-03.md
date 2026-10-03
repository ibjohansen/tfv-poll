# Aktivitetsimport 3. oktober 2026

Status: implementert lokalt, verifisert på isolert Neon-gren og migrert/importert
i produksjonsdatabasen 3. oktober 2026 etter eksplisitt godkjenning.
Koden følger importendringen i Git. Ingen push eller kodepublisering er utført.

## Produksjonsresultat

- Gjenopprettingspunkt: `pre-activity-import-20261003`, fra produksjonsgrenen.
  Den eksakte snapshot-ID-en er registrert i den private importloggen i databasen.
  Opprettet `2026-10-02T23:07:06Z` (3. oktober kl. 01:07 norsk tid),
  utløper `2026-10-10T23:00:00Z`.
- Skjemamigrering fullført `2026-10-02T23:07:41.690Z`. Alle 18 eksisterende aktiviteter
  var uendret etter de 61 avgrensede SQL-setningene.
- Produksjonsplanens hash var identisk med testplanen nedenfor.
- Importtransaksjon startet `2026-10-02T23:08:16.210Z` og ble committet uten feil.
  11 nye kladder, 4 oppdaterte regnearktreff og 14 polygoner konvertert til linjer.
  Totalt 29 aktiviteter, 16 publiserte og 13 kladder uten geometri.
- Uavhengig kontroll fra en ny databaseforbindelse bekreftet: alle 14 linjer innenfor
  originalpolygonene, alle 29 aktiviteter gyldige mot katalogen, originalenes nummer,
  farger, slettestatus og publiseringsstatus bevart. Ferdighetspark/Pumptrack beholder polygonene.
- 40 audit-poster for aktør `activity-import:2026-10-03`: 3 nye kategorier,
  6 nye typer, 2 oppdaterte typer, 11 nye aktiviteter og 18 oppdaterte aktiviteter.
  Ingen andre tabellnavn forekommer for importaktøren. Typebeskyttelsestriggeren er aktiv.
- Privat backup i `activity_map_import_runs` inneholder alle 18 opprinnelige aktiviteter
  og opprinnelig katalog. Backupen har ingen automatisk utløpsdato i skjemaet.
- `npm run check`: lint, 394 tester og produksjonsbygg bestått.
  Aktivitetskartets nettlesertester: 5 bestått, 1 planlagt hoppet over
  (den delte kartmotorens test kjøres bare på desktop). `git diff --check` bestått.

## Godkjent grunnlag

Kilde: `aktiviteter.xlsx`, `Sheet1!B1:I16`, 15 aktiviteter.
SHA-256: `04dd1d1fd81a662664455bd47f26b747049e13e9c7f7c8c868729ca5047d0577`.
Arbeidsboken er lest med Artifact Tool og er ikke endret. Et privat JSON-mellomformat
inneholder overskrifter, rader og kilde-hash; det skal ikke legges i Git.

- Pumptrack oppdaterer Pupmtrack med samme ID og polygon.
- Flytsti Slåttelia oppdaterer Flytsti med samme ID og beregnet linje.
- Øvre Vesleåtjern oppdaterer Robåt med samme ID, ny kategori og polygon-type.
  Robåt manglet geometri og var kladd; dette beholdes.
- Ferdighetspark oppdateres med tekst og sesong/webside, men beholder polygonet.
  Brukerens avklaring overstyrer regnearkets «Linje».
- 11 øvrige aktiviteter opprettes uten geometri, som kladder.
- De tre nye kategoriene er Utsalg, Aktivitet og Trening. Nye typer representerer
  sted/punkt, område/polygon og rute/linje. Eksisterende kategorier og navn beholdes.
- 13 aktive alpinpolygoner blir linjer. Harahopp beholder kladd uten geometri.
  Alpint får Vinter som sesong der sesong mangler. Nummer og farger beholdes.
- Tomme farge- og nummerkolonner i regnearket overskriver ikke eksisterende data.
  Nye ikke-tomme verdier avvises til eksplisitt feltmapping er definert.

## Konvertering og begrensninger

`scripts/activity-centerline.mjs` beregner en indre rute gjennom polygonets
triangulering. Kortere sidegrener velges bort. Heisenes firkanter konverteres
til linjer mellom midtpunktene på de korte endene. Linjene jevnes forsiktig og
forenkles bare når de fremdeles ligger innenfor originalpolygonet.
Hele linjesegmenter kontrolleres mot grensen, ikke bare redigeringspunktene.

Dette er geometrisk beregnede traseer, ikke oppmålte løypelinjer eller høydedata.
Kontroller særlig Flytsti Slåttelia, som inneholder et bredt område der et polygon
ikke entydig angir trasé. Alle linjer kan redigeres videre i kartet.
Originalgeometrien beholdes i databasens private importbackup.

## Testgrunnlag

Isolert testgren: `test-activity-import-20261003`, opprettet fra produksjonsgrenen,
utløper 4. oktober 2026 kl. 23:00 UTC.
`.env.local` og `.neon` er ikke endret. Testen bruker grenens direkte forbindelse
kun i minnet; ingen legitimasjon skrives i rapporter eller terminalutdata.

Testet skjema-hash: `8ede663045228e4091947ff0f0478ddc9c8cb1ae4e096f7c5e435883de39b7b6`.
Testet importplan-hash: `e0e96c8c08c3ccdbae3494c97f2e00e64a648774c42bbabacf0223f14c2a3712`.
Produksjonsplanen må kontrolleres på nytt dersom data har endret seg.

- Avgrenset skjemamigrering: 61 SQL-setninger, 18 eksisterende aktiviteter uendret.
- Import: 11 nye, 4 regnearkoppdateringer, 14 konverterte polygoner.
- Resultat: 29 aktiviteter, 16 publiserte og 13 kladder uten geometri.
- Gjentatt import er en no-op. Gjentatt skjemamigrering bevarer alle 29 aktiviteter.
- PGlite tester blant annet foreldet plan, dubletter, usikre URL-er, rollback
  etter en feil midt i importen, fullstendig backup og bevart typebeskyttelse.

## Produksjonsprosedyre

1. Innhent eksplisitt godkjenning. Opprett og kontroller et nytt Neon-snapshot
   av produksjonsgrenen. Ikke bruk testgrenen som produksjonsforbindelse.
2. Kjør `scripts/release-activity-map-schema.mjs` med direkte
   `DATABASE_URL_UNPOOLED`, `--host`, `--environment production`, `--confirmed`
   og den testede `--schema-sha256`. Migreringen bevarer eksisterende data.
3. Kjør `scripts/import-activities.mjs --input <privat-json> --host <direkte-vert>
   --environment production` uten `--apply`. Sammenlign plan og antall med ovenstående.
4. Kjør samme kommando med `--apply --confirmed --plan-sha256 <kontrollert-hash>
   --snapshot <verifisert-snapshot-id> --actor activity-import:2026-10-03`.
   Produksjon skal aldri bruke testmarkøren `isolated-test-branch`.
5. Kontroller resultat, audit-logg, backup og at eksisterende nummer, farger,
   publiseringsstatus og de to beskyttede polygonene er bevart. Kontroller at bare
   aktivitetskartets tabeller er endret. Offentlig kartcache må få utløpe eller
   invalideres via den vanlige applikasjonsmekanismen.
6. Kodepublisering krever egen commit/push-instruksjon. Forsiden skal fortsatt
   vises på forsiden. Uten skjemamigreringen kan den nye kodeversjonen
   ikke lese de nye feltene.

## Gjenoppretting

Alle eksisterende aktiviteter, kategorier og typer lagres i `activity_map_import_runs`
i samme transaksjon som dataendringene, med kilde-hash, plan-hash, aktør og snapshot-ID.
Importfeil ruller tilbake data, backup og midlertidig triggerendring samlet.

Ved senere angrebehov: innhent eksplisitt instruksjon, kontroller nye brukerendringer
og gjenopprett bare berørte aktivitetsrader og katalogtyper fra denne backupen i en
låst, auditert transaksjon. Ikke gjenopprett hele medlemsdatabasen over nyere endringer.
Neon-snapshotet er en separat reserve og kan gjenopprettes til en isolert gren for kontroll.

## Kodeoverlevering

Sesongfilter, websidefelt og lenkevisning er ferdig lokalt. De krever en egen
kodepublisering før de er tilgjengelige på produksjonsnettstedet. Allerede publisert
kode kan fortsatt vise/redigere geometrien fordi den leser typekatalogen dynamisk.
Den offentlige kartcachen har 300 sekunders revalideringsintervall.
Kartet vises på forsiden; nye kladder publiseres ikke automatisk.

Foreslått commitmelding:
`feat(activity-map): import workbook activities with seasons and safe centerline conversion`

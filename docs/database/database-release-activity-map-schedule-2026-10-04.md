# Aktivitetskart – Kartverket-publisering og månedlig kontroll 4. oktober 2026

Status: produksjonsdatabasen er migrert og verifisert. Alle aktiviteter med
lagret Kartverket-kobling er publisert. Den månedlige kontrollflyten er
implementert, produksjonshemmeligheten er konfigurert i Netlify og kodeversjonen
er rullet ut i produksjon.

## Gjenopprettingspunkt

Et ferskt, manuelt Neon-snapshot av produksjonsgrenen ble opprettet umiddelbart
før migreringen. Det utløper automatisk 12. oktober 2026 kl. 22:00 UTC. Den
eksakte ID-en beholdes i Neons driftslogg og legges ikke i repositoryet.

Snapshotet skal ikke gjenopprettes automatisk. En gjenoppretting kan reversere
legitime endringer etter tidspunktet og krever en ny, uttrykkelig beslutning.

## Isolert test

- En tidsbegrenset Neon-gren med produksjonsdata ble opprettet fra
  produksjonsgrenen.
- 83 avgrensede skjemaoperasjoner ble kjørt i én transaksjon.
- Alle 349 eksisterende aktiviteter ble bevart, og null geometrier ble ugyldige.
- Publiseringsjobben flyttet nøyaktig 75 av 75 Kartverket-koblede aktiviteter ut
  av kladd på testgrenen.
- En syntetisk månedskjøring bekreftet atomisk månedsclaim, at et samtidig nytt
  forsøk ikke hentet kildene på nytt, og at kontrollen ble liggende til manuell
  oppfølging.

## Produksjonsmigrering

- Migreringen ble fullført 4. oktober 2026 kl. 14:48 UTC over direkte
  databaseforbindelse.
- 83 avgrensede skjemaoperasjoner ble kjørt i én transaksjon.
- Alle 349 eksisterende aktiviteter ble bevart, med sju kategorier, tretten
  typer og null ugyldige geometrier.
- `activity_map_source_runs` fikk månedstype, månedsnøkkel og oppfølgingsstatus.
  En partiell unik indeks sikrer høyst én månedskjøring per måned.

## Publisering av Kartverket-løyper

Den første kontrollen fant 75 Kartverket-koblede aktiviteter som kladder. Tre av
dem ble publisert gjennom adminflaten før den låste produksjonstransaksjonen.
Første transaksjonsforsøk oppdaget derfor avviket og rullet tilbake uten
endringer. Et nytt kontrollert forsøk publiserte de 72 gjenværende aktivitetene.

Sluttresultatet er:

- 316 importerte langrennsaktiviteter totalt
- 75 publiserte aktiviteter med Kartverket-kobling
- 241 OSM-only-aktiviteter som fortsatt er kladder
- null Kartverket-koblede kladder
- 72 oppdateringer fra den kontrollerte jobben i `audit_log`; de tre tidligere
  publiseringene har egne eksisterende audit-hendelser

## Månedlig kontroll

- `background-watchdog` forsøker bare på den første kalenderdagen i måneden,
  beregnet i `Europe/Oslo`.
- En separat Netlify Background Function henter Kartverket og OpenStreetMap.
- `ACTIVITY_MAP_JOB_SECRET` er generert som en separat, skjult
  produksjonsvariabel med `builds/functions/runtime`-scope. Verdien er ikke
  lagret lokalt eller i repositoryet.
- Jobben oppretter bare en privat forhåndsvisning. Den endrer, avpubliserer eller
  sletter aldri aktiviteter automatisk.
- Avvik blir en oppgave i admininnboksen. Hele kandidatlisten kan åpnes derfra,
  og oppgaven kan fullføres uten å slette kjøring eller historikk.

## Verifikasjon

- `npm run check`: lint, 424 tester og produksjonsbygg bestått.
- Eksakte bakgrunnsruter og lookalike-ruter er dekket av proxytest.
- Feil metode, manglende/feil hemmelighet, ugyldig måned og feil
  oppstartskvittering er testet.
- Månedlig idempotens, kladdepubliseringens avgrensning og reapplicering av
  skjemaet er testet både lokalt og mot isolert Neon-gren.

## Deploy

- Commit `d0d7215` ble pushet til `main` og fikk terminal Netlify-status
  `ready` 4. oktober 2026 kl. 14:58 UTC.
- Deployen inneholder `activity-map-import-background` og den eksisterende
  `background-watchdog`, fortsatt med femminuttersplanen `*/5 * * * *`.
- Produksjonsforsiden svarte med HTTP 200 og rendret både aktivitetskartet og en
  publisert Kartverket-løype.
- Netlify returnerer en umiddelbar plattform-202 for Background Functions før
  worker-resultatet er kjent. Autentiserings- og valideringsavslag verifiseres
  derfor med automatiserte handler-tester, ikke ved å tolke den ytre
  202-responsen som workerens resultat.

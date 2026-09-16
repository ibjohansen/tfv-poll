# Databasemigrering – 16. september 2026

**Status: Fullført og verifisert i produksjon 16. september 2026 kl. 09:49 UTC.**

Etter eksplisitt godkjenning fra prosjekteier ble gjeldende `database/schema.sql`
kjørt med direkte databaseforbindelse og `APP_ENVIRONMENT=production`. Skjemaets
SHA-256 var `e0d80e9f6a189cb99c8d6ef1e7fcca8787873b152554f63d4474c027e12a8cf1`.
Ingen deploy, GitHub-push, Netlify-/Entra-endring eller produksjonseksport ble
utført.

## Omfang

- Opprettet `usage_daily_stats` for anonyme dagsaggregater med faste verdier for
  sidetype og grov enhetskategori.
- Bekreftet de fire nye polygonfeltene og versjoneringstriggeren på
  `member_hamlets`. Migreringen opprettet ingen grender eller polygondata.
- Kjørte hele skjemaet i én transaksjon gjennom det eksisterende, idempotente
  `npm run db:setup`-skriptet.

## Forhåndskontroll og test

- [x] Verifisert at pooled runtime-URL og direkte migrerings-URL peker mot samme
  Neon-endepunkt, og at databasens miljømarkør var `production`.
- [x] Kjørt migreringen på schema-only-grenen `migration-check-20260915`, uten
  kopiering av produksjonsrader. Statistikktabell, constraints og indekser ble
  verifisert der først.
- [x] Bekreftet at ingen Matrikkel-, survey-e-post-, nyhetsbrev- eller
  leveringsjobber var aktive rett før produksjonskjøringen.
- [x] `npm run check` bestod med lint, 256 tester og produksjonsbygg.
- [x] `npm audit` rapporterte 0 sårbarheter. PostgreSQL-integrasjonstestene og
  målrettede nettlesertester for statistikkvisningen bestod også.

## Gjenopprettingspunkt

- Navn: `pre-usage-statistics-20260916`.
- Snapshot-ID: `snap-calm-tooth-b2la3e2u`.
- Opprettet: 16. september 2026 kl. 09:49:08 UTC.
- Utløper automatisk: 23. september 2026 kl. 12:00 UTC.

Snapshotet ligger i Neon og er ikke en lokal databaseeksport. Gjenoppretting er
ikke kjørt; den kan erstatte nyere data og krever en egen vurdering og godkjenning.

## Etterkontroll

- [x] `usage_daily_stats` finnes og er tom før den nye applikasjonsversjonen
  publiseres. Alle constraints og indekser er gyldige.
- [x] Fire polygonkolonner finnes på `member_hamlets`, og
  `member_hamlets_version_trigger` er aktiv.
- [x] Alle 27 eksisterende tabeller hadde uendrede radantall etter kjøringen.
  Alle 428 medlemsposter er bevart, og audit-/sikkerhetsloggenes radantall ble
  ikke endret av migreringen.
- [x] Ingen bakgrunnsjobber startet under migreringen.

Produksjonsdatabasen er klar for den nye koden, men innsamling og grafvisning er
ikke funksjonelt verifisert i produksjon før en separat godkjent Netlify-deploy.

## Etterfølgende lokal skjemaendring

Kodebasen inneholder nå en ny, additiv migrering for reservasjon mot manuell
deling med Turufjell AS:

- `members.turufjell_as_sharing_opt_out BOOLEAN NOT NULL DEFAULT FALSE`
- `members.turufjell_as_sharing_opt_out_updated_at TIMESTAMPTZ`

Denne etterfølgende endringen inngår ikke i den fullførte produksjonskjøringen
eller SHA-256-verdien over. Den må testes og kjøres separat med eksplisitt
godkjenning før den tilhørende applikasjonskoden deployes.

# Databasemigrering – 17. september 2026

**Status: Fullført og verifisert i produksjon 17. september 2026 kl. 10:39 UTC.**

Etter eksplisitt godkjenning fra prosjekteier ble gjeldende
`database/schema.sql` kjørt med direkte databaseforbindelse og
`APP_ENVIRONMENT=production`. Skjemaets SHA-256 var
`a3cb365c16ada5d93ffa45163c6377a0db116bcb14362b752360ed23fcc23d72`.
På migreringstidspunktet ble ingen deploy, GitHub-push, Netlify-/Entra-endring
eller produksjonseksport utført.

## Omfang

- Opprettet `survey_attachments` for metadata til private vedlegg knyttet til
  én undersøkelse.
- Opprettet den partielle sorteringsindeksen
  `survey_attachments_survey_order_idx`.
- Opprettet context- og audit-trigger for tabellen.
- Bekreftet at `storage_key` fjernes fra audit-data før lagring.
- Kjørte hele skjemaet i én transaksjon gjennom det eksisterende, idempotente
  `npm run db:setup`-skriptet.

## Forhåndskontroll og test

- [x] Verifisert at pooled runtime-URL og direkte migrerings-URL peker mot samme
  Neon-database, og at migrerings-URL-en ikke bruker pooler.
- [x] Verifisert produksjonsmarkøren `production` og at
  `survey_attachments` ikke fantes før migreringen.
- [x] Verifisert at ingen Matrikkel-, survey-e-post- eller nyhetsbrevjobber var
  aktive.
- [x] Opprettet schema-only-grenen
  `migration-survey-attachments-20260917` (`br-lucky-scene-b288s8px`) med
  automatisk utløp 24. september 2026. Ingen medlemsrader ble kopiert.
- [x] Kjørt skjemaet to ganger på testgrenen og verifisert idempotens, staging-
  miljømarkør, tom vedleggstabell, indeks og begge triggere.
- [x] `npm run check` bestod med lint, 292 tester og produksjonsbygg før
  migreringen.

## Gjenopprettingspunkt

- Navn: `pre-survey-attachments-20260917`.
- Snapshot-ID: `snap-green-water-b2e5qics`.
- Opprettet: 17. september 2026 kl. 10:38:16 UTC.
- Utløper automatisk: 24. september 2026 kl. 22:00 UTC.

Snapshotet ligger i Neon og er ikke en lokal databaseeksport. Gjenoppretting er
ikke kjørt; den kan erstatte nyere data og krever en egen vurdering og
godkjenning.

## Etterkontroll

- [x] Databasens miljømarkør er fortsatt `production`.
- [x] `survey_attachments` finnes med 12 forventede kolonner og null rader.
- [x] Indeksen og begge audit-triggerne finnes.
- [x] Audit-funksjonen redigerer bort private lagringsnøkler.
- [x] 428 aktive medlemsposter og én aktiv undersøkelse er bevart.
- [x] Ingen bakgrunnsjobber startet under migreringen.

## Etterfølgende deploy

Etter separat godkjenning ble `SECURITY_EVENT_HMAC_KEY` konfigurert som skjult
produksjonsvariabel i Netlify, og applikasjonen ble publisert manuelt
17. september 2026 som deploy `6aabcf7534ce877445bd1bb3`. Netlify rapporterte
seks tilgjengelige funksjoner og status `ready`.

Offentlige røykprøver bekreftet 200-respons fra forsiden og undersøkelsen,
videresending av admin til innlogging, 404 med `Cache-Control: private,no-store`
for ukjent vedlegg og 401 for uautentisert opplastingsforsøk. En innlogget test
med en ufarlig fil gjenstår før vedleggsflyten er funksjonelt verifisert ende til
ende. Kildeendringene må også committes og pushes slik at neste Git-baserte
deploy ikke erstatter den manuelle produksjonsdeployen med eldre kode.

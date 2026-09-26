# Økonomi – «Lagt ut av», database 26. september 2026

## Produksjonsmigrering: fullført

Prosjekteier godkjente uttrykkelig produksjonsmigreringen. Den ble fullført
26. september 2026 kl. 01:20:22 norsk tid (25. september kl. 23:20:22 UTC).
Ingen Netlify-deploy, Git-commit, push eller endring av miljøvariabler inngikk.

- `accounting_expenses.claimant_name` og `accounting_attachments.uploaded_by`
  er lagt til som tekstfelt med tom standardverdi og lengdegrense 320 tegn.
  Eldre poster er ikke tilordnet dagens bruker eller siste redigerer.
- Direkte og pooled forbindelse ble bekreftet mot produksjonsgrenen
  `br-misty-paper-b2tequav` i prosjektet `ancient-wildflower-97748936`.
  Ingen bakgrunnsjobber var aktive ved forhånds- eller etterkontroll.
- Schema-only-grenen `test-accounting-claimants-20260926`
  (`br-shy-sea-b2w85tns`) hadde 37 tomme tabeller før syntetiske testdata ble
  opprettet. Ingen produksjonsrader ble kopiert. Fem integrasjonstester bestod
  på ekte PostgreSQL, inkludert samtidighet, idempotens og revisjonsspor.
  Syntetiske eldre svar, invitasjoner og tokens ble bevart gjennom testen.
- Snapshot `pre-accounting-claimants-2026-09-26`,
  ID `snap-royal-base-b2366hje`, ble opprettet kl. 23:19:43 UTC og kontrollert
  mot riktig produksjonsgren før migreringen. Snapshotet beholdes uten angitt
  utløpsdato. Ingen gjenoppretting er utført.
- `scripts/release-accounting-schema.mjs` kjørte 23 avgrensede operasjoner
  i én repeatable-read-transaksjon med fem sekunders låsetidsgrense og
  60 sekunders spørringstidsgrense. Den delte revisjonsfunksjonen ble
  sammenlignet med produksjon og bekreftet uendret før kjøringen.
- Radantall og aggregerte kontrollsummer for alle 37 eksisterende tabeller
  var identiske før og etter, kontrollert før commit. Ingen medlemsrader,
  bilagsinnhold, tokens eller forbindelsesstrenger ble skrevet til logger.
- Ny direkte forbindelse verifiserte kolonnene, tre regnskapstabeller,
  seks audit-triggere, tre navngitte regnskapsindekser og generert NOK-beløp.
  En separat, skrivebeskyttet kontroll via appens pooled forbindelse bekreftet
  23 kostnader og 24 vedlegg; alle nye navnefelt på eldre poster var tomme.
- Den midlertidige testgrenen ble slettet etter verifikasjon. Bare produksjonsgrenen
  står igjen. De syntetiske testdataene kan gjenskapes fra testskriptene;
  produksjonssnapshotet er beholdt. Lokal `.env.local` og `.neon` ble ikke endret.

Kontrollert SHA-256 for `database/schema.sql`:
`20ef5d7cfe2dd7fd6b619e8e3852cf88572d376a668f1dd5a0b4aaf47ae23a4a`.

## Applikasjon og tilbakeføring

Ny kode kan nå brukes mot produksjonsdatabasen fra det lokale utviklingsmiljøet.
Publisering av UI-endringen krever en separat godkjent deploy. Grendefilteret
for undersøkelsesresultater trenger ingen databasemigrering.

Ved en applikasjonsfeil beholdes de additive kolonnene. Ikke gjenopprett hele
databasen automatisk: det kan overskrive aktivitet etter snapshotet.

Commitforslag: `docs: record verified claimant database migration`.

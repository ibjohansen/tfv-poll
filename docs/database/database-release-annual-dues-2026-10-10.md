# Årskontingent: produksjonsmigrering 10. oktober 2026

Den additive databasemigreringen er fullført etter brukerens uttrykkelige
godkjenning av produksjonsmigrering, push og deploy. Fakturautsendelse er ikke
godkjent. Ingen ekte kampanje, faktura, betaling eller e-post ble opprettet.
Kode publiseres gjennom produksjonsgrenen `main` og Netlifys Git-baserte bygg.

## Migrering og gjenoppretting

- Produksjonsgrenen og direkte databaseforbindelse ble kontrollert mot Neon.
  Databasens miljømarkør var `production`; ingen bakgrunnsjobber var aktive.
- En kortlivet schema-only-gren ble opprettet fra produksjon uten medlemsdata.
  Migreringen ble kjørt to ganger, og syntetiske kontroller av hjemmelsgrense,
  kampanjeunikhet, uforanderlige dokumenter, delbetaling, idempotens,
  betaltmarkering og årsavslutning bestod. Testtransaksjonen ble rullet tilbake.
- Et nytt snapshot ble opprettet rett før produksjonsmigreringen. Det utløper
  17. oktober 2026 kl. 23:59:59 UTC. Snapshot-ID og private driftsresultater
  beholdes utenfor Git; ingen databasedump eller forbindelsesstreng følger koden.
- Kun `database/annual-dues.sql` ble utført, i én transaksjon. Hele
  `database/schema.sql` ble ikke kjørt mot produksjon.
- Migreringen ble committet 10. oktober 2026 kl. 08:49:37 UTC
  (kl. 10:49:37 i Oslo). SHA-256:
  `9b5121111957a83a7a983aa405d5502af52ab3542c6a23dffbe02d0378185d44`.
- 40 SQL-operasjoner opprettet seks tabeller, ti additive kolonner, funksjoner,
  indekser og syv aktive kontrolltriggere. De 13 funksjonene ble kontrollert
  mot den gjennomgåtte migreringen før commit.
- Radantall og samlede kontrollsummer i alle 46 eksisterende tabeller var
  uendret. Nye additive kolonner ble utelatt fra sammenligningen av gamle rader.
  Historisk balanse, inntektsinnstillinger, budsjetter, bilag og medlemsdata
  ble ikke omskrevet.
- Etterkontrollen viste null kampanjer, fakturaer, betalinger og fakturaer i
  e-postkøen. For 2026 var 406 ordinære medlemmer innenfor hjemmelsgrensen,
  21 hadde hjemmel etter 1. februar og én manglet avklart dato.

## Funksjon og verifikasjon

Fakturering finnes i Økonomi under «Fakturering», med arkiverte PDF-er,
kontrollert nummerserie, separate sendeforsøk, betalingshistorikk og
leveringsrapporter på tomten. Vedtektsteksten og hjemmelsgrensen inngår i
kontrollene. Kampanjen stenges ved formell årsavslutning.

Eksisterende regnskap, neste års budsjett og historisk balanse kan eksporteres
som private PNG-bilder. Løpende bankavstemming, hovedbok og løpende balanse
inngår ikke i denne endringen; manuelle inntektssummer beholdes.

- `npm run check`: lint, 453 tester og produksjonsbygg bestått.
- 12 eksisterende økonomitester i nettleser og de to nye fokuserte kontrollene
  bestått på desktop/mobil; tilgang, tastatur og tilgjengelighet er kontrollert.
- Faktura-PDF og PNG-rapportene er rendret og visuelt kontrollert med
  syntetiske dokumentdata og protokollens regnskapsreferanse.
- `npm audit --omit=dev`: ingen sårbarheter i runtime-avhengighetene.
  Full audit har fem eksisterende høye funn i utviklingsverktøyenes
  `braces`/`micromatch`-kjede. Ingen trygg patch er tilgjengelig i den låste
  verktøykjeden; tvungen hovedversjonsnedgradering er ikke utført.
- `git diff --check` bestått. Private Lavish-artefakter, miljøfiler,
  driftsfiler, tokens og eksporterte medlemsdata inngår ikke i commiten.

## Kontroll ved publisering

Migreringen er fullført før publisering fordi webhook-behandlingen bruker
de nye leveringskolonnene. Kontroller Netlifys produksjonsdeploy mot Git-commit,
PDF-fontene og logoen i serverpakken, administratorvern for de nye rutene og
at `INVOICE_EMAIL_ENABLED` fortsatt er fraværende eller `false`.
Variabelen skal først aktiveres etter en egen, uttrykkelig bestilling om sending.
Ingen ekte testmail skal brukes til utrullingskontroll uten slik bestilling.

Ved en applikasjonsfeil beholdes det additive skjemaet, og forrige Netlify-deploy
kan reaktiveres. Snapshotet skal ikke gjenopprettes automatisk, siden det kan
overskrive legitim aktivitet etter migreringen.

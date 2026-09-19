# Databasemigrering – 19. september 2026

**Status: Fullført og verifisert i produksjon 19. september 2026 kl. 15:14 UTC.**

Etter eksplisitt godkjenning fra prosjekteier ble gjeldende
`database/schema.sql` kjørt med direkte databaseforbindelse og
`APP_ENVIRONMENT=production`. Skjemaets SHA-256 var
`69dab7454d52d99e66dba0cc42c9d82c48a12cb9c52f268b54e57ee665237f83`.
Hele det idempotente skjemaet ble kjørt i én transaksjon gjennom
`npm run db:setup`.

## Omfang

- Opprettet `members.search_document`, `pg_trgm`-støtten og den partielle
  GIN-indeksen `members_search_document_trgm_idx`.
- Opprettet `cms_page_revisions` og de additive CMS-kolonnene for versjon,
  publisert revisjon, dekorativt bilde og miniatyrmetadata.
- Opprettet én innledende revisjon for hver av de tre eksisterende CMS-sidene.
- Kjørte den dokumenterte tilbakefyllingen av `email_deliveries.source_group_id`.
  Etterpå hadde alle leveranser med en kampanjegruppe utfylt kildegruppe.

## Forhåndskontroll

- [x] Neon CLI pekte på standardgrenen `production`, og `neon config plan`
  rapporterte ingen konfigurasjonsendringer.
- [x] Databasens miljømarkør var `production`, og den direkte forbindelsen brukte
  ikke pooler.
- [x] Ingen Matrikkel-, survey-e-post- eller nyhetsbrevjobber var aktive.
- [x] Radantall og personverntrygge kontrollsummer ble registrert uten å hente ut
  medlemsrader eller annet personinnhold.
- [x] `npm run check` bestod med lint, 339 tester og produksjonsbygg før
  migreringen.

## Gjenopprettingspunkt

- Navn: `pre-admin-schema-2026-09-19-codex`.
- Snapshot-ID: `snap-dark-meadow-b2745xz9`.
- Opprettet: 19. september 2026 kl. 15:10:45 UTC.
- Ingen automatisk utløpsdato ble satt.

Snapshotet ligger i Neon og er ikke en lokal databaseeksport. Gjenoppretting er
ikke kjørt; den kan erstatte nyere data og krever en egen vurdering og
godkjenning.

## Etterkontroll

- [x] Databasens miljømarkør er fortsatt `production`, og ingen bakgrunnsjobber
  startet under migreringen.
- [x] Radantallene i alle beskyttede tabeller er uendret: blant annet 431
  medlemmer, 126 svar, 3 CMS-sider og 17 CMS-vedlegg.
- [x] Kontrollsummene for eksisterende innhold er uendret med unntak av den
  forventede, dokumenterte tilbakefyllingen av `source_group_id`.
- [x] `cms_page_revisions` inneholder tre innledende revisjoner, og alle
  forventede CMS-kolonner finnes.
- [x] Medlemssøkets genererte kolonne og GIN-indeks finnes. En personverntrygg
  `EXPLAIN (ANALYZE, BUFFERS)` bekreftet `Bitmap Index Scan` på
  `members_search_document_trgm_idx`. Den naturlige planen kan fortsatt velge
  sekvensielt søk for dagens lille register.

## Etterfølgende deploy

Commit `08eea36` ble pushet til `main` og publisert av Netlify 19. september
2026 kl. 15:18 UTC. Deployen inneholder også CSP-rettelsen i `481c086`.
GitHub Actions-jobben `quality` fullførte med status `success`.

Etter publisering ble følgende verifisert:

- Forsiden og innloggingssiden svarer 200 som dynamiske sider med
  `private,no-cache,no-store`.
- Alle script-nonce-verdier samsvarer med CSP-headeren; en isolert
  nettleserkontroll fant ingen konsollfeil eller applikasjonsfeil.
- Beskyttede adminsider videresender uinnloggede brukere til innlogging, og
  admin-API-ene svarer 401 med `Cache-Control: no-store` uten gyldig sesjon.
- Den persistente adminmenyen er verifisert i en isolert ende-til-ende-test.
  Innlogget produksjonsnavigasjon ble ikke automatisert, fordi det ville krevd
  å omgå den ordinære Microsoft Entra-innloggingen.

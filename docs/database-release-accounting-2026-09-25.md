# Regnskap – database og utrulling 25. september 2026

## Database: fullført

Produksjonsmigreringen ble eksplisitt godkjent av prosjekteier og fullført
25. september 2026 kl. 12:56:22 UTC. Ingen eksisterende data ble endret.

- Schema-only-testgrenen inneholdt ingen produksjonsrader. Lokal `.env.local`
  og koblingen til produksjonsgrenen ble ikke endret.
- Fem integrasjonstester bestod på ekte Neon PostgreSQL, inkludert samtidige
  bilagsregistreringer, samtidige statusoppdateringer, duplikatbeskyttelse,
  eksakt valutaberegning, idempotens og sladding av lagringsnøkler i audit.
- Ingen produksjonsjobber var aktive ved forhåndskontroll, migrering eller
  etterkontroll.
- Snapshot `pre-accounting-2026-09-25`, ID `snap-morning-hill-b2e3etri`, ble
  opprettet kl. 12:55:11 UTC og kontrollert før migrering. Ingen automatisk
  utløpsdato er satt. Ingen gjenoppretting er utført.
- `scripts/release-accounting-schema.mjs` anvendte nøyaktig 19 SQL-operasjoner
  fra det kontrollerte skjemaet, med direkte forbindelse og i én transaksjon.
  Tidligere, uvedkommende tilbakefyllinger i fullskjemaet ble ikke kjørt.
- Radantall og aggregerte kontrollsummer for alle 34 eksisterende tabeller
  var identiske før/etter, kontrollert i samme repeatable-read-transaksjon.
  Ingen medlemsrader, tokens eller databaseeksporter ble hentet ut.
- Tre regnskapstabeller, tre navngitte indekser, seks audit-triggere og
  generert NOK-beløp ble kontrollert fra en ny produksjonsforbindelse.
- Ingen virkelige kostnader, årssnapshots eller bilag er importert automatisk.
  Budsjettgrunnlaget for 2026 vises som forslag til administrator lagrer det.

Kontrollert SHA-256 for `database/schema.sql`:
`e134d787e5117d425c024f900d5cfa821bcb7656fe5d40888ec30f1ced728234`.

Ved gjentakelse må vert, snapshot, hash og godkjenning kontrolleres på nytt.
Bruk først `--action status`, deretter godkjent `--action migrate --confirmed`,
og avslutt med `--action verify`. Skriptet krever `--environment`, `--host`
og, ved migrering, `--schema-sha256` og et produksjons-`--snapshot`.
Forbindelsen leses bare fra servervariabelen `DATABASE_URL_UNPOOLED`.

## Applikasjon: publisert og teknisk etterkontrollert

Netlify-deploy `6ab67198af583916033744a2` ble publisert 25. september 2026
kl. 13:06:49 UTC på `https://medlemsservice.turufjellvel.no`.
Netlifys API bekreftet `ready`, `production` og ingen deployfeil.
Forrige kjente deploy er `6ab59992aa35420008bb9a3c`, fra Git-commit `e8e9968`.

- Direkte CLI-deploy fra en ren, midlertidig byggmappe. Ingen `.env`-filer,
  `.neon`, legitimasjon eller private bilag ble kopiert fra arbeidsmappen.
  Ingen Netlify-miljøvariabler eller Entra-innstillinger ble endret.
- Låste avhengigheter ble installert med `npm ci`. Linux x64 GNU canvas 1.0.9
  ble lagt til bare i byggmappen for Linux-runtime. Alle øvrige installerte
  pakkeversjoner ble kontrollert mot `package-lock.json` uten avvik.
- En midlertidig `onPostBuild`-kontroll stoppet publisering dersom noen av de
  seks funksjonsarkivene inneholdt lokale miljøfiler, eller dersom serverpakken
  manglet regnskapsruter, PDF.js-worker eller Linux canvas. Kontrollen bestod.
- Bygg og publisering ble kjørt i samme `netlify deploy --prod`-kommando.
  CLI 27.8 bygger som standard. Et tidligere forsøk stoppet før publisering
  fordi npm arvet offline-modus; det endret ikke den publiserte appen.
- `npm run check` bestod: lint, 362 tester og produksjonsbygg. Åtte
  regnskapsnettlesertester bestod på mobil/desktop, og `npm audit` fant ingen
  kjente sårbarheter. Fem Neon-integrasjonstester er omtalt ovenfor.
- Ytelseskontrollen bestod i et rent bygg uten lokale miljøfiler eller gammel
  byggcache. Kjøring i den eksisterende arbeidsmappen rapporterte seks tidlige
  Kartverket-forespørsler på forsiden. Både uendret grunnversjon og ny versjon
  bestod i rene bygg; ingen uvedkommende kartkode ble endret for testen.
- Begge regnskapssidene videresender uinnloggede til innlogging (307).
  Oversikt, eksport, bilagsnedlasting og begge POST-rutene avviser uten økt
  med 401. API-responser har `no-store`.
- Forsiden, innlogging og informasjonssiden svarer 200. Alle script-noncer
  samsvarte med CSP-headeren. Regnskaps- og årsmøte-JavaScript samt CSS ble
  SHA-256-verifisert mot publisert bygg; ikonruten leverer PNG med 200.
- Appens pooled Neon-forbindelse kan lese alle tre nye tabeller. Tabellene
  var tomme ved etterkontroll; ingen syntetiske regnskapsposter er lagt i
  produksjonen.
- Den midlertidige Neon-testgrenen er slettet, og bare produksjonsgrenen står
  igjen. Snapshotet er beholdt.

Innlogget produksjonskontroll med ekte Entra-økt og bilagsopplasting gjenstår.
Innlogging ble ikke omgått for å gjennomføre en test.

**Git-oppfølging:** Etter direktepubliseringen godkjente prosjekteier også
commit og push til `main`. Regnskapskode, skjema, tester og denne rapporten
inngår i samme endring, slik at senere Git-baserte deployer beholder modulen.
GitHub Actions og Netlify kjører nye kontroller ved push; den direkte
publiseringen beskrevet ovenfor er den først verifiserte produksjonsversjonen.

Commit-melding: `feat: add accounting module and verified database release`.

Ved applikasjonsfeil kan forrige deploy reaktiveres mens de additive
regnskapstabellene beholdes. Ikke gjenopprett hele databasen automatisk:
det kan overskrive nye medlemssvar og annen aktivitet etter snapshotet.

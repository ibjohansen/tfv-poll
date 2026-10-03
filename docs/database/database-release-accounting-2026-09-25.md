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

## Oppfølging: kontingentimport og kostnadsoversikt

Tilleggsmigreringen for fakturaoppfølging ble utført og den utvidede
regnskapsmodulen ble publisert 25. september 2026.

- Schema-only-grenen `test-accounting-fees-20260925` verifiserte alle 37
  eksisterende tabeller uten produksjonsrader. Fem PostgreSQL-integrasjonstester
  bestod med syntetiske data.
- Snapshot `pre-accounting-fees-2026-09-25`, ID
  `snap-divine-firefly-b25zc3dw`, ble opprettet kl. 14:37:34 UTC før
  produksjonsmigreringen.
- Migreringsskriptet anvendte 21 godkjente operasjoner. Kontroll av radantall og
  kontrollsummer viste at eksisterende data var bevart. Kolonnen
  `member_annual_fees.invoiced_on`, kandidatindeksen, tre regnskapstabeller,
  seks audit-triggere og tre regnskapsindekser ble verifisert fra en ny
  produksjonsforbindelse kl. 14:38:03 UTC.
- Kontrollert SHA-256 for skjemaet var
  `28176b0226fe0c9ce6a473faff39245d24ed16dc3f774d22c368243a57ad7021`.
- `npm run check` bestod med lint, 367 tester og produksjonsbygg. Tolv
  regnskapsnettlesertester bestod på mobil og desktop. Ingen avhengigheter eller
  låsefiler ble endret.
- Netlify-deploy `6ab6885be4d7e5c397df02d3` ble publisert kl. 14:43:53 UTC.
  Netlifys API bekreftet status `ready`, produksjonskontekst og ingen feil.
- Deployen ble bygget fra en ren midlertidig mappe. En `onPostBuild`-kontroll
  bekreftet seks funksjonsarkiver uten lokale miljøfiler, med de nye rutene,
  PDF.js-worker og Linux x64 GNU canvas i serverpakken.
- Forsiden og informasjonssiden svarte 200. Publisert JavaScript, CSS og logo
  svarte 200 med riktig innholdstype. Regnskapssiden videresendte uinnloggede
  til innlogging, og både hoved-API-et og den nye inkassoeksporten avviste
  uinnloggede med 401.

Innlogget produksjonskontroll av fakturaimport, betalingsimport og eksport til
inkasso/regnskapsfører gjenstår. Ingen ekte kontingentfil eller kostnad ble
opprettet under etterkontrollen.

Ved applikasjonsfeil kan forrige deploy reaktiveres mens de additive
regnskapstabellene beholdes. Ikke gjenopprett hele databasen automatisk:
det kan overskrive nye medlemssvar og annen aktivitet etter snapshotet.

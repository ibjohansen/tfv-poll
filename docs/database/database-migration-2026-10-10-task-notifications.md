# Produksjonsmigrering: oppgavevarsling 10. oktober 2026

Status: den godkjente, additive databasemigreringen er fullført og verifisert.
Den tilhørende kodeendringen legger til oppgavevarsling og redigerbart H-nummer
i medlemsregisteret og kartets medlemsdetaljer.

## Test og gjenopprettingspunkt

- En kortlivet schema-only-gren fra produksjon ble opprettet uten medlemsdata.
- Alle seks oppgavetyper ble prøvd med syntetiske data. Åtte forventede varsler
  ble lagret i køen; ingen reelle e-poster ble sendt fra testen.
- Bekreftelse og behandling av samme oppgave opprettet ikke et nytt varsel.
  Kontaktendringer uten kommentar og kontroller uten avvik opprettet ingen varsel.
- Tilbakerulling fjernet alle syntetiske rader, inkludert de atomiske varslingene.
- Migreringen ble kjørt to ganger på testgrenen med uendret eksisterende innhold.
- Et ferskt snapshot av produksjonsgrenen ble opprettet rett før migreringen.
  Snapshotet utløper 16. oktober 2026 kl. 23:59:59 UTC. Eksakt ID beholdes i den
  private driftsloggen; ingen databasedump eller forbindelsesstreng inngår i Git.

## Produksjonsmigrering

- Produksjonsgrenen og den direkte `DATABASE_URL_UNPOOLED` ble kontrollert mot
  Neon. Databasens miljømarkør var `production`, og ingen bakgrunnsjobber var aktive.
- `database/task-notifications.sql` ble utført i én transaksjon 9. oktober
  2026 kl. 23:36:11 UTC, tilsvarende 10. oktober kl. 01:36:11 i Oslo.
- Migreringens SHA-256 var
  `6c879350874c56f0abb67e684d99c65ec0ae675f4c86eb5c9066f2dad440e610`.
- 15 SQL-operasjoner la til tre køkolonner, én partiell indeks og fire triggere,
  samt varslingens triggerfunksjon og utvidelse av tillatte e-posttyper.
- Radantall og samlede kontrollsummer i alle 46 eksisterende tabeller var uendret.
  Nye køkolonner ble utelatt fra sammenligningen av eksisterende e-postrader.
- Kolonnenes typer, indeks, fire aktive triggere og samsvar med den gjennomgåtte
  triggerfunksjonen ble kontrollert før transaksjonen ble committet.
- Ingen gamle oppgaver ble etterfylt eller varslet av migreringen.
- Den tidligere bestilte rettingen av Sprenåsgrenda 24 til H101 ble bekreftet.

## Applikasjon og verifikasjon

- Nye oppgaver kølegger ett sammendrag til `post@turufjellvel.no`. Eksisterende
  femminutters-watchdog starter den nye Netlify-bakgrunnsfunksjonen.
- Funksjonen bruker eksisterende MailerSend-konfigurasjon og jobbhemmelighet.
  Ingen miljøvariabler eller Entra-konfigurasjon er endret.
- H-nummer redigeres manuelt med samme administratortilgang og revisjonslogg
  som kontaktfeltene. Matrikkelkontroll overskriver ikke H-nummeret.
- `npm run check`: lint, 439 tester og produksjonsbygg bestått.
- Fire fokuserte nettlesertester bestått på mobil og desktop for begge visningene.
- Fakturautsendelse inngår ikke i denne utrullingen; funksjonen er fortsatt en plan.

Ved en applikasjonsfeil beholdes det additive skjemaet og forrige Netlify-deploy
kan reaktiveres. Snapshotet skal ikke gjenopprettes automatisk, siden det kan
overskrive legitim aktivitet som har kommet til etter migreringen.

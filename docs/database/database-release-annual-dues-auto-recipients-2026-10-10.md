# Automatisk fakturaadresse: produksjonsmigrering 10. oktober 2026

Etter brukerens beslutning om at det vaskede medlemsregisteret er grunnlaget
for fakturaadresser, er manuell klargjøring av mottaker og fakturaadresse fjernet.
Fakturaen bruker hjemmelshaver som mottaker og medlemmets hoved-e-post som
fakturaadresse. E-postsending er fortsatt deaktivert og ingen e-post er sendt.

## Migrering og bevaring

- En isolert schema-only-gren fra produksjon testet migreringen to ganger med
  syntetiske data. Den opprettet ikke klargjorte mottakere, og alle testdata ble
  rullet tilbake.
- Et nytt snapshot ble tatt rett før produksjonsendringen og utløper 17. oktober
  2026 kl. 23:59:59 UTC. Snapshot-ID og forbindelsesdetaljer oppbevares privat.
- Kun `database/annual-dues-auto-recipients.sql` ble kjørt i én transaksjon.
  Den erstatter `annual_dues_issue` med en variant som ikke kaller den gamle
  klargjøringsrutinen. SHA-256:
  `70b8b27657f428fa5d6319dbde69c5eb5ac60a1fdc0a8c388700deda85aa494f`.
- Kontrollsummer og radantall i alle 53 eksisterende tabeller var uendret.
  Arkiverte PDF-er, kampanjer, medlemmer, betalinger og den historiske
  `annual_dues_recipients`-tabellen ble ikke omskrevet.
- Etterkontrollen viste produksjonsmiljø, aktiv automatisk mottakerfunksjon,
  ingen klargjorte mottakere og null fakturautsendelser.

## Verifikasjon

- `npm run check`: lint, 456 tester og produksjonsbygg bestått.
- Den nye faktureringsflyten er testet med automatisk hjemmelshaver og
  hoved-e-post på desktop og mobil. Den sender ingen mottaker-, adresse- eller
  bekreftelsesfelt fra nettleseren.
- Tomter uten hoved-e-post kan ikke faktureres. Sperrer for medlemsstatus,
  hjemmelsdato, endret eier, nummerserie og avsluttet regnskapsår består.

Koden publiseres gjennom `main` og Netlifys Git-baserte produksjonsbygg. Etter
publisering skal administratorvern og fortsatt deaktivert `INVOICE_EMAIL_ENABLED`
kontrolleres. Ingen ekte testmail skal brukes.

# Fakturaavsender og avgiftsunntak: produksjonsmigrering 10. oktober 2026

Oppfølgingen bruker brukerens tidligere godkjenning til produksjonsmigrering,
push og deploy. Ingen e-postsending er bestilt. Foreningens oppgitte adresse,
telefon, e-post, nettside og organisasjonsnummer er lagret; bankkonto er tom
inntil et reelt kontonummer legges inn. Fakturering sperres uten bankkonto.

## Migrering og bevaring av data

- En kortlivet schema-only-gren uten produksjonsdata ble opprettet fra produksjon.
  Migreringen bestod to kjøringer, syntetiske transaksjoner med rollback og
  samtidighetskontroller fra to ekte databaseforbindelser.
- Et nytt snapshot ble tatt rett før migreringen. Det utløper 17. oktober 2026
  kl. 23:59:59 UTC. Private driftsfiler og snapshot-ID beholdes utenfor Git.
- Kun `database/invoice-settings.sql` ble kjørt, med 11 SQL-operasjoner i én
  transaksjon. Commit i databasen: 10. oktober 2026 kl. 09:50:06 UTC
  (kl. 11:50:06 i Oslo). SHA-256:
  `9c16ae0bc9b3f68404c375b8287b8c0cb631e89aac8a584c3fc246026013a37c`.
- Én innstillingstabell, én additiv kampanjekolonne, to funksjoner og tre
  kontrolltriggere er verifisert mot gjennomgått SQL. Hele databaseskjemaet
  ble ikke kjørt mot produksjon.
- Radantall og samlede kontrollsummer i alle 52 eksisterende tabeller var
  uendret; den nye avgiftskolonnen ble utelatt fra sammenligningen av gamle rader.
  Kampanjers opprinnelige avsendersnapshot, faktura-PDF-er, betalinger, bilag,
  medlemsdata, budsjett og historisk balanse ble ikke omskrevet.
- Produksjonsmarkøren var `production`; ingen bakgrunnsjobber var aktive.
  Etterkontrollen viste null kampanjer, fakturaer, betalinger og fakturautsendelser.

## Funksjon og kontroll

Økonomi → «Innstillinger» lagrer fakturaavsender på tvers av år, med validering
av norsk kontonummer, flere adresselinjer, versjonskontroll og revisjonsspor.
En samtidig innstillingsendring sperrer lagring av en PDF fra gamle verdier.
Nye fakturaer i en pågående kampanje bruker gjeldende innstillinger; kopier
bruker fortsatt den opprinnelige arkiverte fakturaen.

Kampanjen lagrer «Årskontingent unntatt merverdiavgift» som uforanderlige
avgiftsmetadata. Unntaket må bekreftes før kampanjestart og følger fakturaen.

- `npm run check`: lint, 456 tester og produksjonsbygg bestått.
- 14 eksisterende økonomikontroller og to nye kontroller av innstillingslagring,
  fakturagrunnlag og obligatorisk avgiftsbekreftelse bestått på desktop/mobil.
  Den nye siden er kontrollert med axe og ved 320 piksler skjermbredde.
- PDF med syntetisk mottaker/bankkonto og oppgitte avsenderopplysninger er
  rendret og visuelt kontrollert; adresse og kontaktopplysninger passer på én side.
- Ingen avhengigheter eller lockfil er endret. Ingen private driftsfiler,
  tokens, miljøfiler, dokumenteksporter eller Lavish-artefakter inngår i commiten.

## Kontroll ved publisering

Koden publiseres gjennom `main` og Netlifys Git-baserte produksjonsbygg etter
migreringen. Kontroller publisert deploy mot Git-commit, administratorvern for
innstillingsruten, PDF-fontene/logoen i serverpakkens tracing og fortsatt
deaktivert `INVOICE_EMAIL_ENABLED` i både nettstedets og kontoens miljøvariabler.
Ingen ekte testmail skal brukes uten en egen, uttrykkelig bestilling.

Ved applikasjonsfeil beholdes det additive skjemaet mens forrige deploy kan
reaktiveres. Snapshotet skal ikke automatisk gjenopprettes over nyere data.

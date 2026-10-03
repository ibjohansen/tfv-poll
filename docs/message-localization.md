# E-post, eksport og jobbmeldinger – 3. oktober 2026

## Implementasjon

- `locales/{nb,en}/system-email.js`: systemtekst, emner, lenkeforklaringer,
  frister, kvitteringer og grafetiketter. E-postrendererene tar valgfri `locale`.
  Eksisterende utsendelser beholder norsk standard; ingen ny språkpreferanse
  for medlemmer er antatt eller registrert. Språket til administrator skal
  ikke automatisk velge språk for en masseutsending.
- `locales/{nb,en}/exports.js`: kolonneoverskrifter, arkfaner og etiketter for
  medlem, undersøkelse og regnskap. Eksport-rutene bruker forespørselens språk.
  Maskinelle feltnavn og filnavn er beholdt som stabile kontrakter.
- Styregodkjent resultattekst i `data/survey-results-message.js` og historiske
  spørsmål/svaralternativer oversettes ikke. Resultat-e-postens PNG/CID-grafer,
  logo, ekte punktlister og to grafer per rad er beholdt.
- `locales/{nb,en}/jobs.js` og `lib/job-messages.js`: nye synlige jobbfeil og
  kontrollmeldinger bruker kode/parametre, ikke leverandørens fritekst.
  Matrikkel-, nyhetsbrev-, survey- og watchdog-kall og de tilhørende
  adminvisningene bruker samme format.
- MailerSend-feil beholder maskinell klassifisering for retry/status, men
  offentlig svar er fortsatt en trygg oversettelse. Avgrenset diagnostikk i
  eksisterende beskyttet feillogg er ikke det samme som offentlig feilmelding.

## Lagring og bakoverkompatibilitet

Eksisterende tekstkolonner brukes, med formatet
`tfv-message:v1:{"code":"UPSTREAM_HTTP","params":{"httpStatus":"503"}}`.
Bare kjente koder og deres tillatte, begrensede numeriske parametre godtas.
Ukjente koder, ekstra parametre, personopplysninger og rå leverandørtekst
renderes ikke. Ingen nye kolonner eller produksjonsmigrering er nødvendig.

Kjente gamle norske meldinger og enkelte historiske koder oversettes ved
lesing. Ukjent historisk fritekst vises som en generell feil; originalen er
ikke slettet eller omskrevet i databasen. Dette er bevisst fail-closed-visning,
ikke en fullstendig automatisk oversettelse av alle historiske logger.

Publiser webapplikasjon og bakgrunnsfunksjoner sammen. En helt gammel UI-versjon
kan vise den nye konvolutten som råtekst ved tilbakeføring. Ved rollback bør
lesestøtten beholdes eller tilbakeføres separat; lagrede jobbdata skal ikke
masseomskrives for å få eldre kode til å se penere ut.

## Testdekning

Tester dekker like nøkler/parametre i nb/en, HTML-escaping, sikker lenketekst,
uendret styretekst og snapshots, PNG/CID-bilder, eksportceller, språkstyrt
footer uten duplikat, gamle/nye/ukjente jobbmeldinger og faktisk lagring med
PGlite/fullt skjema. Nettlesertester kontrollerer språkbytte og at privat
leverandørtekst ikke vises på desktop/mobil. Ingen reell e-post sendes.

Siste lokale kontroll: `npm run check` bestått (411 tester, lint og
produksjonsbuild), Playwright 92 bestått/to planlagte hopp over, og
produksjonsytelsesbudsjettet bestått. SQL-testen dekker både oppstartsfeil og
manuell godkjenning med det nye meldingsformatet.

Separat PostgreSQL-samtidighetssuite krever isolert testdatabase/CI; en lokal
PGlite-test er ikke en erstatning for denne.

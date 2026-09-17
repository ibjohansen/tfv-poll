# Svaralternativer, mottakere og kopiering

Status: migrert og publisert i produksjon 17. september 2026 etter eksplisitt
godkjenning og testing på isolert Neon-schema-only-gren. Eksisterende data er
verifisert bevart. Ingen ekte invitasjoner eller kvitteringer er sendt som del
av arbeidet. Se [produksjonsrapporten](database-release-survey-options-2026-09-17.md).

Kontrollert lokalt: 317 enhetstester, lint og produksjonsbygg uten database,
44 isolerte nettlesertester på desktop/mobil samt fire ekstra regresjonstester
som verifiserer faktisk bildelasting og utsendelsespanelet. `npm audit` fant
ingen kjente sårbarheter. Etter eksplisitt godkjenning er også **57 reelle
Postgres-integrasjonstester bestått** på en midlertidig gren med bare syntetiske
data. Gjentatt migrering, eldre svar/invitasjoner, samtidige svar og
kvitteringskø er verifisert. Se [testrapporten](database-test-survey-options-2026-09-17.md).

## Bruk

- Hvert spørsmål har standardalternativene **Ja / Nei / Vet ikke**, eller
  2–20 egendefinerte alternativer. Administrator velger enkeltvalg eller flervalg.
  «Egendefinert» betyr alternativer skrevet av administrator, ikke fritekstsvar.
- Spørsmål, alternativ-ID-er, tekster og valgtype inngår i versjonsøyeblikksbildet.
  Gamle `ja`/`nei`/`usikker`-svar beholdes. Flervalgsprosent bruker antall
  besvarelser som nevner; summen kan derfor overstige 100 %.
- Utsendelse kan velge en gruppe, enkelttomter eller begge. Hoved-e-post er
  standard. **Ta også med øvrige registrerte e-postadresser** er et eksplisitt valg.
  Samme normaliserte adresse dedupliseres innen hver tomt, ikke mellom tomter.
- **Begrenset til ett svar per tomt** er på som standard. Første innsending som
  lagres atomisk vinner; senere innsendinger erstatter aldri spørsmål eller svar.
  Uten avkrysning teller hver invitert e-postadresse én selvstendig besvarelse.
  Denne tolkningen er gjort eksplisitt i grensesnittet.
- Regelen låses etter første invitasjon/svar, også ved senere tillegg av mottakere.
- **Legg til nye mottakere** beholder kampanje og svar. Adresser som allerede har
  en invitasjonsleveranse til den aktuelle tomten/undersøkelsen legges ikke til på
  nytt, heller ikke ved overlappende grupper. Feilede leveranser blir ikke stille
  forsøkt sendt igjen; **Send nye sikre lenker** er en separat, bekreftet handling.
- Ved flere mottakere viser invitasjonen adressene på samme tomt og svarregelen.
  Ingen adresser fra andre tomter vises.
- Hoved-e-post får en kølagt kvittering for hver mottatt innsending. Kvitteringen
  identifiserer tellende svar og avsender. Ved en senere innsending vises også
  forsøkets spørsmål/svar, tydelig merket ikke tellende. Bare tellende svar inngår
  i statistikk og resultateksport. Formuleringen er bevisst forskjellig i UI.
- Manglende/ugyldig hoved-e-post kan ikke motta kvittering. Hvis hoved-e-post
  endres før utsendelse, holdes kvitteringen tilbake av personvernhensyn.
  Eldre lenker/økter uten mottakerbinding avvises kontrollert dersom hoved-e-post
  er fjernet; de skal ikke gi en databasefeil ved innsending.
- Kopiering av undersøkelse/artikkel gir et nytt, stengt/upublisert utkast med
  egne vedleggs-/bildenøkler. Svar, utsendelser og tilgangstokens kopieres ikke.
  Nyhetsbrev kopieres til et redigerbart utkast som må lagres før utsendelse.
  Undersøkelseskopien beholder spørsmålsvalg og svarregelen, men starter på
  spørsmålversjon 1. Eldre artikler uten riktekst kan også kopieres.
  Ved ukjent transaksjonsresultat beholdes private filkopier for kontroll;
  de slettes ikke automatisk når databasen kan ha lagret det nye utkastet.
  Søk etter enkelttomter er tilgangsstyrt med undersøkelsesrollen og returnerer
  bare ID, H-nummer, adresse og kontaktperson, ikke hele medlemsprofilen.

## Datamodell og kjøring

`surveys.single_response_per_property` styrer svarnøkkelen. Unikhet på
`survey_responses(member_id, survey_id, response_key)` avgjør konkurrerende svar.
Konflikthåndteringen returnerer eksisterende vinner uten å endre besvarelsen.
Personlige tokens og sesjoner er bundet til mottakeradressen; sending til en
ekstra mottaker opphever ikke hovedmottakerens lenke.

`survey_response_receipts` er en transaksjonell utboks: svar, eventuelt senere
forsøk og kvittering lagres samlet. Den inneholder personopplysninger og skal
ha samme private databaseadgang som medlemsregisteret. Sesjoner kan ryddes uten
å slette kvitteringen. Ingen ny offentlig rute eksponerer utboksen.

Eksisterende `survey-email-background` støtter også `{ receipts: true }`, bak
samme hemmelighet. En databaseleie hindrer samtidige kvitteringsarbeidere.
`background-watchdog` vekker ventende kvitteringer hvert femte minutt dersom
direkte oppstart feilet, og sørger for at avbrutte behandlinger blir merket
feilet etter at arbeiderens leie har utløpt. Status vises aggregert i utsendelsespanelet.
Undertrykking kontrolleres før sending. Ukjent leveringsresultat/avbrutt worker
sendes ikke automatisk på nytt; det merkes feilet for manuell vurdering.
Dette hindrer dobbeltsending, men er ingen garanti for levering hos mottakeren.
Invitasjoner, nyhetsbrev og kvitteringer deler fortsatt leverandørens totale
sendekvote; kjør ikke flere store utsendelser samtidig uten å kontrollere denne.

## Før produksjonssetting

- [x] Test `database/schema.sql` to ganger i et isolert miljø med syntetiske data.
- [x] Kjør integrasjonstestene, særlig samtidige svar, senere hovedmottakersvar,
  uavhengige svar, flere tokens, kvitteringskø og tillegg av mottakere.
- [x] Innhent eksplisitt godkjenning til produksjonsmigrering og deploy.
- [x] Sett en kort vedlikeholdsperiode for undersøkelsessvar/utsendelser og vent
  til aktive jobber er ferdige. Ta gjenopprettingspunkt og sammenlign radantall.
- [x] Kjør migreringen med direkte forbindelse, deretter deploy tilhørende kode.
  Dette er **ikke** en helt additiv migrering: tre gamle unike indekser erstattes.
  Gammel svarkode kan ikke kjøre videre mellom indeksbytte og deploy.
- [ ] Verifiser mottakerpreview, enkelt-/flervalg, ekstra e-post, første svar,
  hovedmottakerkvitteringer, kopiering og scheduler med godkjente testmottakere.
- [x] Planlegg eventuell tilbakeføring før migrering. Etter uavhengige svar kan
  flere tellende besvarelser tilhøre samme tomt; ikke gjenopprett gammel unik
  indeks eller slett slike svar for å få gammel kode til å virke.
  Gjenopprettingspunkt og begrensninger er dokumentert i produksjonsrapporten;
  ingen tilbakeføring er utført.

Ingen nye produksjonsmiljøvariabler, API-ruter eller npm-pakker kreves av disse endringene.
Testkjøreren bruker separate `TEST_NEON_*`-markører bare i testprosessen; disse
skal ikke legges i Netlify eller `.env.local`.
Eksisterende private objektlager benyttes med GetObject/PutObject, som er
[dokumentert støttet av Neon](https://neon.com/docs/storage/s3-compatibility).
Samtidige svar bruker PostgreSQLs atomiske
[ON CONFLICT-håndtering](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT).

# Endringslogg

## Ikke publisert

- Bekreftelseslenker for undersøkelser, medlemsinnsyn, e-postendring og
  medlemsregistrering omdirigerer til det konfigurerte hoveddomenet. Dette
  hindrer at Netlifys interne deploydomene skiller den sikre sesjonscookien fra
  målsiden og feilaktig viser lenken som utløpt.
- Språk velges bare manuelt av brukeren og lagres i cookie; nettleserens
  `Accept-Language` påvirker ikke lenger grensesnittet.
- De seks mottakerne i e-postgruppen «Styret 2026» har fått gjenopprettet
  grendekoblingene sine i produksjonsregisteret. Endringen er revisjonslogget,
  og det ble tatt et tidsbegrenset Neon-gjenopprettingspunkt først.

## Publisert 17. september 2026 – svaralternativer og mottakere

- Migrering og 57 databaseintegrasjonstester verifisert på godkjent, midlertidig
  Neon-schema-only-gren med syntetiske data. Produksjonsmigrering og deploy
  deretter godkjent og utført med gjenopprettingspunkt og bevarte data i
  14 kontrollerte tabeller; se
  [produksjonsrapport](docs/database-release-survey-options-2026-09-17.md).
  Rettet kopiering av artikler uten riktekst, bevaring av svarregel ved kopiering
  og avvisning av eldre svarøkter når hoved-e-post er fjernet.
- Felles tilgjengelige nedtrekkslister, umiddelbare filtre, mindre
  registeravkrysninger og eiendomstooltip på tre rader. Ikonoversikt i docs.
- Behovsstyrt bildelasting og pause av karusellen utenfor skjermen; filnavn med
  nullutfylte bildenummer godtas.
- Egne svaralternativer og enkelt-/flervalg, versjonerte resultater og eksport.
- Valgfri utsendelse til ekstra e-postadresser, tillegg av grupper/enkelttomter,
  atomisk første-svar-regel per tomt og privat kvitteringsutboks til hoved-e-post.
- Kopiering av undersøkelser, artikler og nyhetsbrev til nye utkast. Private
  filer kopieres til egne objektnøkler. Koordinert migrering og deploy er utført;
  innlogget produksjonskontroll og faktisk e-postlevering gjenstår.
- Rettet publisering av statiske Next.js-filer ved å bruke komplett bygg/deploy
  fra en ren byggmappe. Ingen miljøvariabler, Git-push eller ekte utsendelser
  ble endret/utført i denne produksjonsrunden.

## Tidligere endringer

- Undersøkelsesutsendelse kontrollerer Netlifys faktiske forespørselskontekst
  i stedet for byggvariabelen `CONTEXT`. Start-/gjenopptakingsknapper beholdes
  synlige ved feilkonfigurasjon, med forklaring om manglende jobbhemmelighet,
  produksjonsmiljø eller stengt undersøkelse.
- Private undersøkelsesvedlegg kan lastes opp, navngis og fjernes direkte i
  administrasjonen, og er bare tilgjengelige med riktig surveyøkt eller
  administratorrettighet.
- Tilgjengelig bildekarusell på forsiden med automatisk mappeoppdagelse,
  fotografkreditering, pause ved hover/fokus og navigasjon med piler, tastatur og
  bildeindikatorer.
- Offentlig grendekart uten forhåndsvalg, med av/på-knapper og behovsstyrte
  registereiendommer som kan velges fra kart eller tabell, uten å eksponere
  kontaktopplysninger. Lagret grendekobling er felles kilde for alle visninger.
- Kontrollert engangskommando for å beregne og lagre `members.hamlet_id` fra alle
  godkjente grendepolygoner, med tørrkjøring, konfliktvern og audit.
- Produksjonsregisteret er kontrollert og oppdatert med 424 entydige
  grendekoblinger; 4 tomter uten sikkert treff er beholdt ukoblet.
- Grendefilter, gruppetelling, offentlig kart og registerlaget for en valgt
  grend i adminkartet bruker nå samme lagrede kobling; gjentatt manuell
  polygonkobling fra adminkartet er fjernet.
- Reservasjon mot manuell deling med Turufjell AS i selvbetjening og admin, med endringstidspunkt, audit, filter og trygg eksportstandard.
- Kartet ligger i grendepanelet, og valg av lagret grend laster polygonet direkte; den midlertidige utkastkatalogen er fjernet etter databasekontroll.
- Søkepolygonet ligger øverst; kartobjekter åpner medlemsdetaljer, og nye tomter får trygg automatisk grendetilknytning ved ett eksakt geografisk treff.
- Kartmodulens CSV-/GeoJSON- og kopieringsfunksjoner er fjernet.
- Nedtrekksmenyer med en direkte handling er justert med knappen på samme horisontale linje.
- Matrikkeldata kan oppdateres for ett søkbart, entydig valgt medlem.
- Egenhostet, anonym bruksstatistikk med varige dagsaggregater, Visx-grafer og adminoversikt.
- Sikrere oppstart av survey-e-postjobben: kun direkte HTTP 202 godtas.
- Masseutsendelse fra undersøkelser krever nå Netlify-produksjonskontekst og
  en sterk jobbhemmelighet før kampanjen opprettes; localhost kan ikke legge
  igjen en utsendelse som blir stående i «Venter».
- Matrikkeljobber med tidsbegrenset reservasjon, avgrenset gjenopptaking og overvåking.
- Atomisk Matrikkel-start: parallelle forespørsler kan ikke opprette to aktive kjøringer.
- Aktørlogg for stopp, godkjenning og skjuling av matrikkelkjøringer.
- Databasebeskyttelse mot endring, sletting og tømming av brukerloggen.
- Valgfri medlemskommentar i endringshistorikk og administrativ oppgaveliste.
- Medlemsstatus per tomt, én sikker inngang for felles hoved-e-post og separate tomteprofiler.
- Grender, administrerbare e-postgrupper, registerfiltre og unik mottakertelling.
- CMS-riktekst med begrenset JSON-format og trygg visning av gamle artikler.
- Nyhetsbrevutkast, forhåndsvisning, testmail og deduplisert bakgrunnskø uten sporing.
- Samlet kampanje-/testmailhistorikk og minimal sikkerhetshendelse ved egeneksport.
- Lesbart favicon/Apple-ikon fra eksisterende grafisk logo og ryddet prosjektmetadata.
- Isolerte Postgres-integrasjonstester og nettlesertester for desktop og mobil.
- Åpne teiggrenser fra Kartverket/Geonorge, også uten adresse, med UTM/GML-kontroll.
- Ukjent geografisk plassering holdes utenfor mangeltall; teiggrenser vises med tydelig kilde og datakvalitet.
- Reproduserbar, rollback-basert loggsøkmåling på 100 000 syntetiske endringer.

Se README og migreringsrapportene for produksjonsstatus og gjenstående
funksjonelle kontroller. En deploy alene bekrefter ikke ekte e-postlevering.

# Endringslogg

## Ikke publisert

- Offentlig grendekart uten forhåndsvalg, med av/på-knapper og behovsstyrte
  Kartverket-eiendommer som kan velges fra kart eller tabell; H-nummer suppleres
  ved sikkert registertreff uten å eksponere kontaktopplysninger.
- Reservasjon mot manuell deling med Turufjell AS i selvbetjening og admin, med endringstidspunkt, audit, filter og trygg eksportstandard.
- Kartet ligger i grendepanelet, og valg av lagret grend laster polygonet direkte; den midlertidige utkastkatalogen er fjernet etter databasekontroll.
- Søkepolygonet ligger øverst; kartobjekter åpner medlemsdetaljer, og nye tomter får trygg automatisk grendetilknytning ved ett eksakt geografisk treff.
- Kartmodulens CSV-/GeoJSON- og kopieringsfunksjoner er fjernet.
- Nedtrekksmenyer med en direkte handling er justert med knappen på samme horisontale linje.
- Matrikkeldata kan oppdateres for ett søkbart, entydig valgt medlem.
- Egenhostet, anonym bruksstatistikk med varige dagsaggregater, Visx-grafer og adminoversikt.
- Sikrere oppstart av survey-e-postjobben: kun direkte HTTP 202 godtas.
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

Disse endringene krever godkjent migrering og publisering før de er tilgjengelige i produksjon.

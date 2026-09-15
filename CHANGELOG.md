# Endringslogg

## Ikke publisert

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
- Ukjent geografisk plassering holdes utenfor mangeltall; grenser følger GeoJSON-eksport.
- Reproduserbar, rollback-basert loggsøkmåling på 100 000 syntetiske endringer.

Disse endringene krever godkjent migrering og publisering før de er tilgjengelige i produksjon.

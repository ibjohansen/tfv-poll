# Langrennsløyper – produksjonsmigrering og kladdeimport 4. oktober 2026

Status: fullført og verifisert. Databaseskjemaet er migrert og det kontrollerte
utvalget er importert som kladder. Ingen langrennsløype er publisert.

## Gjenopprettingspunkt

- Produksjonsgren: `br-misty-paper-b2tequav`.
- Snapshot: `snap-bold-dream-b2y0k5s9` (`pre-cross-country-import-20261004`).
- Opprettet: 4. oktober 2026 kl. 11:26:47 UTC.
- Automatisk utløp: 12. oktober 2026 kl. 22:00 UTC.

Snapshotet skal ikke gjenopprettes automatisk. En gjenoppretting kan også
reversere legitime endringer som er utført etter snapshotet og krever derfor en
ny, uttrykkelig beslutning.

## Isolert test

- Schema-only gren: `br-curly-rice-b2o4bsqp`,
  `test-cross-country-import-20261004`.
- Automatisk utløp: 6. oktober 2026 kl. 22:00 UTC.
- Grenen inneholder ikke kopierte medlemsrader. Én syntetisk aktivitet ble lagt
  inn for å kontrollere at eksisterende aktivitetsdata ble bevart.
- Migreringen kjørte 72 avgrensede SQL-setninger og bevarte den syntetiske
  aktiviteten uendret.
- Første import opprettet 316 kladder og 320 kildekoblinger.
- Nytt uttrekk etter import ga 320 uendrede kildeobjekter, 98 avviste objekter
  og null nye, endrede eller manglende objekter.

Testen avdekket at migreringsvernet opprinnelig sammenlignet totalt radantall
før og etter de idempotente seed-radene. Den første testtransaksjonen ble derfor
rullet tilbake. Vernet ble rettet til å kontrollere alle eksisterende ID-er og
felt uendret samtidig som tilsiktede nye seed-rader tillates. Testen ble deretter
kjørt på nytt med godkjent resultat før produksjon.

## Produksjonsmigrering

- Fullført: 4. oktober 2026 kl. 11:27:08 UTC.
- Skjemaets SHA-256:
  `f0078023a4daa8c181e33c0ec4b35da3ea94ed96eb8e1e5eb356852020f404f9`.
- 72 avgrensede SQL-setninger ble kjørt i én transaksjon over direkte
  forbindelse.
- Alle 33 eksisterende aktiviteter ble bevart uendret.
- Resultatet hadde sju kategorier, tretten typer og null ugyldige geometrier.

## Produksjonsimport

- Import-run: `867e1163d5d24c7cae62afafb1caaf79`.
- Plan-hash:
  `c96258d02f100b4280093b0cb9d22d9e1ab6aa5c5478604c96ddab2934b66112`.
- Uttrekket inneholdt 418 kandidater: 316 nye, fire sikre
  sekundærkoblinger og 98 avviste/utenfor området.
- 316 aktiviteter ble opprettet som vinter-/langrennskladder.
- 320 kildekoblinger ble lagret; Kartverket og OpenStreetMap peker på samme
  aktivitet for de fire sikre treffene.
- Ingen eksisterende aktivitet ble oppdatert, ingen importert aktivitet ble
  publisert og verifikasjonen fant null ugyldige importaktiviteter.
- Kontrolluttrekk `5e3961a2511847f9919c569e0ec4ff35` etter importen ga
  320 uendrede objekter, 98 avviste og null valgbare kandidater.

## Verifikasjon og videre arbeid

- `npm run check`: lint, 417 tester og produksjonsbygg bestått.
- Kildene ble hentet server-side med faste URL-er, tids-/størrelsesgrenser og
  uten rå leverandørfeil i offentlige svar.
- Kladdene må gjennomgås visuelt i admin. Publisering er en separat handling per
  aktivitet og var ikke del av denne kjøringen.

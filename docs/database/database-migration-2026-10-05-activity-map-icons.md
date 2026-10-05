# Produksjonsmigrering: katalogikoner i aktivitetskartet, 5. oktober 2026

Den additive aktivitetskartmigreringen ble kjørt mot produksjonsdatabasen 5.
oktober 2026 etter uttrykkelig godkjenning. Kodepublisering og Git-commit
gjennomføres separat etter denne kontrollerte databasesekvensen.

## Gjenopprettingspunkt

- Snapshot: `snap-proud-cell-b25b266m`
- Navn: `pre-activity-map-icons-20261005`
- Opprettet: `2026-10-05T21:11:41Z`
- Utløper: `2026-10-12T23:59:59Z`

Snapshotet må ikke gjenopprettes automatisk: det kan overskrive legitim
aktivitet etter tidspunktet det ble tatt.

## Utførelse og verifikasjon

- Neon CLI var koblet til prosjektet `Msys` og produksjonsgrenen.
- `cms-assets` var privat og policyen hadde ingen ventende endringer.
- Ingen aktivitetsimport hadde status `fetching` eller `applying`.
- Direkte `DATABASE_URL_UNPOOLED` og produksjonsmiljø ble verifisert av
  det avgrensede migreringsskriptet.
- Testet skjema-hash: `afe869f841fff94ca573c3a2eb3841f505b7b34378895e2a180d2fadab695757`.
- Skriptet utførte 104 SQL-operasjoner i én transaksjon.
- Alle 352 eksisterende aktiviteter ble bevart; etterkontrollen fant null
  ugyldige geometrier.
- `icon_key` finnes nå på `activity_map_categories`, `activity_map_types` og
  `activity_map_subtypes`. Ingen katalogikoner var lagret ved tidspunktet for
  kontrollen, som forventet før funksjonen tas i bruk.

Migreringen er additiv. Eldre kode tåler de tomme ikonkolonnene, slik at
Netlify-versjonen kan publiseres etter vellykket databasesjekk.

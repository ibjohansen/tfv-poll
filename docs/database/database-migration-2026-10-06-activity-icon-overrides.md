# Produksjonsmigrering: ikonvalg per aktivitet 6. oktober 2026

Status: fullført og verifisert. Migreringen ble kjørt før den tilhørende
applikasjonsversjonen ble pushet til produksjonsgrenen.

## Gjenopprettingspunkt

- Produksjonsgren: `br-misty-paper-b2tequav` (`production`).
- Snapshot: `snap-silent-smoke-b2fadt0y` (`pre-activity-icon-overrides-20261006`).
- Opprettet: 5. oktober 2026 kl. 22:37:46 UTC, tilsvarende 6. oktober i Oslo.
- Automatisk utløp: 13. oktober 2026 kl. 23:59:59 UTC.

Snapshotet skal ikke gjenopprettes automatisk. En gjenoppretting kan også
reversere legitime endringer etter snapshotet og krever en ny, uttrykkelig
beslutning.

## Isolert test

- Migreringen ble først kjørt på den kortlivede schema-only-grenen
  `test-cross-country-import-20261004`.
- 122 avgrensede SQL-operasjoner ble utført i én transaksjon.
- Alle 328 eksisterende testaktiviteter ble bevart uendret.
- Etterkontrollen fant null ugyldige geometrier eller katalogkoblinger.

## Produksjonsmigrering og verifikasjon

- Produksjonsmiljøet og direkte `DATABASE_URL_UNPOOLED` ble bekreftet.
- Ingen aktivitetsimport hadde status `fetching` eller `applying`.
- Skjemaets SHA-256 var
  `f0c8828f391a58b334d2759437b70f0183251f4f6ab3c1b2c4ce79c1389073c8`.
- 122 avgrensede SQL-operasjoner ble utført i én transaksjon.
- Alle 352 eksisterende aktiviteter ble bevart uendret.
- Etterkontrollen fant null ugyldige geometrier eller katalogkoblinger.
- De fire `icon_override_*`-kolonnene finnes.
- Formkontrollen og tre fremmednøkler til kategori-, type- og
  undertypekatalogene finnes.
- Etter migreringen fantes fortsatt 352 aktive aktiviteter.

Overstyringen lagrer bare stabile katalogreferanser. SVG-filene dupliseres ikke,
og et senere ikonbytte på katalogoppføringen blir derfor brukt av aktivitetene
som peker til den.

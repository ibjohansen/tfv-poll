# Produksjonsmigrering: aktivitetsbilder 6. oktober 2026

Status: fullført og verifisert. Den additive migreringen ble kjørt før den
tilhørende applikasjonsversjonen ble publisert.

## Gjenopprettingspunkt

- Produksjonsgren: `br-misty-paper-b2tequav` (`production`).
- Snapshot: `snap-fancy-sky-b2rocgt1` (`pre-activity-images-20261006`).
- Opprettet: 5. oktober 2026 kl. 22:08:40 UTC, tilsvarende 6. oktober i Oslo.
- Automatisk utløp: 13. oktober 2026 kl. 23:59:59 UTC.

Snapshotet skal ikke gjenopprettes automatisk. En gjenoppretting kan også
reversere legitime endringer som er utført etter snapshotet og krever derfor en
ny, uttrykkelig beslutning.

## Isolert test

- Migreringen ble først kjørt på den eksisterende, kortlivede schema-only-grenen
  `test-cross-country-import-20261004`.
- 110 avgrensede SQL-operasjoner ble utført i én transaksjon.
- Alle 328 eksisterende testaktiviteter ble bevart uendret.
- Etterkontrollen fant null ugyldige geometrier eller katalogkoblinger.

## Produksjonsmigrering og verifikasjon

- Produksjonsmiljøet og direkte `DATABASE_URL_UNPOOLED` ble bekreftet.
- Ingen aktivitetsimport hadde status `fetching` eller `applying`.
- Skjemaets SHA-256 var
  `3e0ef7f6c88bd996232fd62226a1adbfb71bab8a6ee0e11588acc7001cd95279`.
- 110 avgrensede SQL-operasjoner ble utført i én transaksjon.
- Alle 352 eksisterende aktiviteter ble bevart uendret.
- Etterkontrollen fant null ugyldige geometrier eller katalogkoblinger.
- De fire valgfrie bildekolonnene finnes med forventet datatype.
- Integritetsregelen `activity_map_feature_image_check` finnes.
- Audit-funksjonen fjerner den private objektlagringsnøkkelen fra loggdata.

Migreringen legger til støtte for én valgfri bildefil per aktivitet. Selve
bildefilene lagres i den eksisterende private `cms-assets`-bøtten; databasen
lagrer bare objektmetadata og eventuell opprinnelig HTTPS-adresse.

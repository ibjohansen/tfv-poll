# Produksjonsmigrering: aktivitetstyper og undertyper 5. oktober 2026

Den additive aktivitetskartmigreringen ble kjørt mot produksjonsdatabasen
5. oktober 2026 etter uttrykkelig godkjenning. Ingen applikasjonskode ble
deployet, committet eller pushet som del av operasjonen.

## Gjenopprettingspunkt

- Snapshot: `snap-frosty-credit-b2jn1p8t`
- Navn: `pre-activity-subtypes-20261005`
- Opprettet: `2026-10-05T10:50:55Z`
- Utløper: `2026-10-12T23:59:59Z`

Snapshotet skal ikke gjenopprettes automatisk. En gjenoppretting kan overskrive
legitime endringer som er gjort etter snapshot-tidspunktet og må derfor vurderes
og godkjennes særskilt.

## Utførelse og verifikasjon

- Direkte `DATABASE_URL_UNPOOLED` ble brukt, og produksjonsmiljøet ble bekreftet.
- Ingen aktivitetsimportjobb hadde status `fetching` eller `applying`.
- Testet skjema-hash var
  `2d2b3dd495ad5cebd595e49f9205406145d38e8cc6ca5dd62e57b899e95afb1d`.
- Det avgrensede migreringsskriptet utførte 95 SQL-operasjoner i én transaksjon.
- Alle 349 eksisterende aktiviteter ble bevart.
- Etterkontrollen fant null ugyldige geometrier og null ugyldige katalogkoblinger.
- Katalogen inneholder etter migreringen 9 kategorier, 15 typer og 5 undertyper.

Migreringen opprettet `activity_map_subtypes`, la til den valgfrie kolonnen
`activity_map_features.feature_subtype` og etablerte fremmednøkkel,
versjonskontroll og audit-triggere. Følgende katalogdata ble lagt til:

- Alpint → Heis: Skålheis, T-krok, Stolheis og Gondol.
- Utsalg → Sted: Servering.
- Parkering og WC som egne punktkategorier.

Ingen eksisterende aktivitet ble automatisk tildelt en undertype. Undertypene
velges manuelt etter at den tilhørende kodeversjonen er tatt i bruk.

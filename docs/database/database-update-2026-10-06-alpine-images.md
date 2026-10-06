# Oppdatering av bilder for Alpint 6. oktober 2026

Status: fullført og verifisert.

Et tidsbegrenset gjenopprettingspunkt ble opprettet umiddelbart før kjøringen.
Den eksakte snapshot-ID-en beholdes i den private driftsloggen og er ikke lagt i
Git.

Bildet som allerede var lagret på aktiviteten «Trollbåndet», ble brukt som
kilde for de øvrige 13 aktive aktivitetene i kategorien Alpint. Hver aktivitet
fikk sin egen kopi i privat objektlagring, slik at senere utskifting eller
sletting av ett aktivitetsbilde ikke påvirker de andre.

Databaseoppdateringene ble utført samlet i én transaksjon med versjonskontroll
og audit-aktør. Nye objekter ville blitt slettet dersom transaksjonen feilet.
Eventuelle gamle, ubrukte bildeobjekter ble ryddet etter vellykket commit.

Etterkontrollen viste:

- 14 aktive Alpint-aktiviteter totalt.
- 14 aktiviteter med bilde.
- 14 separate objektlagringsnøkler.
- Alle kopiene har samme lagrede størrelse som kildebildet: 182 288 byte.

Ingen medlemsdata, kontaktopplysninger eller bildefiler er lagt i Git.

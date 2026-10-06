# Dokumentoversikt

Aktive arbeidsdokumenter og gjeldende veiledninger ligger direkte i `docs/`.
Historiske rapporter og avsluttede oppgavebeskrivelser ligger i undermappene.
Filnavnene er beholdt, slik at dato og opprinnelig sammenheng er gjenkjennelige.

## Pågående arbeid og beslutninger

- [Integrasjon av langrennsløyper i aktivitetskartet](activity-map-cross-country-integration.md) –
  implementert og produksjonsmigrert kontrollert import fra Kartverket og
  OpenStreetMap, med kildeprioritet, kreditering, månedlig kontroll og trinnvis
  publisering. Kartverket-løypene er publisert; OSM-only-løypene er kladder.
- [Driftskostnader og sikkerhetsvalg](operations-options-2026-10-03.md) –
  alternativer for Neon/Netlify, kostnadsoverslag, sikkerhetsfunn og avklaringer
  om MFA, hemmeligheter og lagringstid.
- [Kodegjennomgang 3. oktober 2026](codebase-review-2026-10-03.md) – status,
  utførte forbedringer, tester og gjenstående oppfølging.
- [Sikkerhetslisten](ToDo-security.md) – tiltak og ferdigkriterier for F-01–F-19.
- [UU-sjekkliste](uu-checklist.md) – tilgjengelighet og gjenstående manuelle tester.
- [Brukertest for kart og registerkontroll](map-register-control-usability-test.md) –
  testopplegg som fortsatt skal brukes, ikke en avsluttet testrapport.
- [Prosjektets ToDo-liste](../ToDo.md) – blant annet deploy og produksjonsmåling.

## Gjeldende veiledninger

- [E-post, eksport og jobbmeldinger](message-localization.md).
- [Språk og oversettelser](internationalization.md).
- [Kart og registerkontroll](map-explorer.md).
- [Økonomi](regnskap.md).
- [Svaralternativer, mottakere og kopiering](survey-options-and-recipients.md).
- [Ikoner](icons.md).
- [Prosjektets README og produksjonsprosedyre](../README.md).

## Historikk

| Mappe | Innhold |
| --- | --- |
| [imports/](imports/) | Rapporter fra gjennomførte importer, inkludert aktivitetsimporten 3. oktober 2026. |
| [database/](database/) | Historiske migrerings-, utrullings- og databasetestrapporter, inkludert [langrennsimporten](database/database-migration-2026-10-04-cross-country.md), [månedlig kontroll/publisering](database/database-release-activity-map-schedule-2026-10-04.md), [Alpint-bilder](database/database-update-2026-10-06-alpine-images.md) og [bildekreditering](database/database-migration-2026-10-06-activity-image-credit.md). |
| [code-review/](code-review/) | Eldre kvalitets- og sikkerhetsgjennomganger som grunnlagsmateriale. |
| [other/](other/) | Avsluttede forbedringsprompter merket `SOLVED` og øvrig historikk. |

Arkivering betyr at dokumentet beskriver et tidligere tidspunkt, ikke at alle
funn eller oppfølgingspunkter er lukket. Status og åpne oppgaver følges i de
aktive dokumentene over. Historiske resultater og avkrysningspunkter beholdes.

Når et aktivt dokument blir historikk, flyttes det til riktig undermappe og
lenkene oppdateres. Nye rapporter som fortsatt bearbeides blir liggende på roten.

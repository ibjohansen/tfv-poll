# Aktivitetskart: kategorier og typer – migrering 2. oktober 2026

Migreringen ble godkjent av brukeren og fullført i produksjonsdatabasen
2. oktober 2026 kl. 21:46:47 UTC (23:46:47 norsk tid).
Koden er ikke committet, pushet eller publisert som del av denne kjøringen.

## Omfang og verifikasjon

- `scripts/release-activity-map-schema.mjs` kjørte 54 avgrensede SQL-setninger
  fra `database/schema.sql` i én transaksjon over direkte tilkobling.
- Tre kategorier og seks kategori-/typekombinasjoner ble opprettet.
- Alle 18 eksisterende aktiviteter beholdt samtlige eksisterende felt uendret,
  kontrollert med sjekksum før og etter migreringen innenfor transaksjonen.
- 17 aktiviteter har tegnet geometri; én er kladd uten geometri.
- Kladden Harahopp bruker eldre JSON `null`. Den er bevart uendret og tolkes
  som uten geometri. Publisering krever fortsatt reell geometri.
- Begge nye audit-triggere er aktive. Navneendringer bruker stabile ID-er og
  versjonskontroll. Ingen e-post, medlemsdata eller andre moduler ble endret.
- Samme migrering ble først kjørt to ganger på en isolert gren uten dataendringer.
- `npm run check`: lint, 391 tester og produksjonsbygg bestått.
- Relevante nettlesertester: tre bestått (inkludert kategorier på mobil), én
  planlagt hoppet over fordi polygonregresjonen bare kjøres på desktop.

Skjemaets SHA-256:
`baa7b95148db71a6e23a1b571ce3f537660c01f2cfb8c4180077fac962c6fa37`

## Gjenoppretting og testgren

- Produksjonsgren: `br-misty-paper-b2tequav` i prosjekt `ancient-wildflower-97748936`.
- Gjenopprettingspunkt: `snap-silent-heart-b21623lg`, navn
  `pre-activity-catalog-20261002`, opprettet 21:44:04 UTC før migreringen.
  Utløper 9. oktober 2026 kl. 23:00 UTC.
- Midlertidig testgren: `br-little-poetry-b22dtyr2`, navn
  `test-activity-catalog-20261002`. Utløper 3. oktober 2026 kl. 23:00 UTC.
- `.env.local`, `.neon`, Netlify- og Entra-konfigurasjon er uendret.

Gjenoppretting er ikke automatisk og krever ny godkjenning: en full gjenoppretting
kan også reversere andre endringer utført etter tidspunktet for snapshotet.

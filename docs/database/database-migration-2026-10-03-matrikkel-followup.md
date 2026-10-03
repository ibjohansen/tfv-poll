# MatrikkeIoppfølging – databasemigrering 3. oktober 2026

## Produksjonsmigrering: fullført

Matrikkeloppgavelisten i `/admin/inbox` var utilgjengelig fordi
`matrikkel_sync_runs.followup_completed_at` manglet i produksjonsdatabasen.
Siden laster medlemsforespørsler og matrikkeloppgaver samlet, og den manglende
kolonnen gjorde at hele listen viste en generell feilmelding.

Etter uttrykkelig godkjenning ble bare de manglende, additive kolonnene lagt
til i Neon-produksjonsgrenen `production` 3. oktober 2026:

- `matrikkel_sync_runs.followup_completed_at TIMESTAMPTZ`
- `matrikkel_sync_runs.followup_completed_by TEXT`

Ingen tabeller, rader, indekser, constraints, miljøvariabler eller Netlify-deploy
ble endret. Migreringen brukte direkte `DATABASE_URL_UNPOOLED` i én transaksjon.

## Forhåndskontroll og gjenoppretting

- Produksjonsgrenen var `br-misty-paper-b2tequav` i prosjekt
  `ancient-wildflower-97748936`.
- Ingen matrikkelkjøringer var aktive før endringen.
- Snapshot `pre-matrikkel-followup-20261003`
  (`snap-small-union-b223knpb`) ble opprettet før migreringen og utløper
  10. oktober 2026 kl. 23:59:59 UTC.

## Etterkontroll

- Begge kolonnene finnes med forventede typer og tillater `NULL` for historiske
  kjøringer.
- Alle 21 eksisterende matrikkelkjøringer er bevart.
- Ingen aktive kjøringer ble funnet etter migreringen.
- De faktiske, skrivebeskyttede spørringene fra `/admin/inbox` lykkes mot
  produksjonsdatabasen: null medlemsforespørsler og én månedlig
  matrikkeloppgave.

Det kreves ingen ny applikasjonsdeploy for at den allerede publiserte
oppgavelisten skal kunne lese kolonnene. Ikke gjenopprett snapshotet automatisk:
det kan overskrive legitime endringer som er gjort etter migreringen.

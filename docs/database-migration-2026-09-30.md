# Databasemigrering – 30. september 2026

## Produksjonsmigrering: fullført

Prosjekteier godkjente uttrykkelig produksjonsmigreringen. Det idempotente
`database/schema.sql` ble kjørt mot Neon-produksjonsgrenen `production`
(`br-misty-paper-b2tequav`) 30. september 2026 kl. 15:43:38 norsk tid
(13:43:38 UTC). Ingen Netlify-deploy, Git-commit, push eller endring av
miljøvariabler inngikk.

- Pooled og direkte forbindelse ble bekreftet mot prosjektet
  `ancient-wildflower-97748936`, databasen `neondb`. Migreringen brukte bare den
  direkte `DATABASE_URL_UNPOOLED`.
- Neon-planen var uten endringer, konflikter eller advarsler før migreringen.
- Ingen e-post-, nyhetsbrev-, matrikkel- eller kvitteringsjobber var aktive før
  eller etter migreringen.
- Schema-only-grenen `test-activity-map-20260930`
  (`br-nameless-voice-b2m7v68c`) inneholdt ingen medlemsrader. Migreringen
  bestod der før produksjonskjøringen. Testen bekreftet 11 kladder, indeks og
  tre triggere, at heispolygon ble godkjent, og at heispunkt ble avvist av
  databasebegrensningen. Syntetiske innsettinger ble rullet tilbake.
- Snapshot `pre-activity-map-2026-09-30`, ID
  `snap-odd-darkness-b2mb01m6`, ble opprettet fra produksjonsgrenen kl. 13:42:59
  UTC og kontrollert før migreringen. Snapshotet beholdes uten angitt utløpstid.
- Produksjonsmigreringen opprettet `activity_map_features`, den partielle
  publiseringsindeksen, versjons- og audit-triggere samt 11 navngitte
  alpinløyper som upubliserte kladder uten geometri.
- Skrivebeskyttet etterkontroll via både direkte og pooled forbindelse
  bekreftet 11 kladder, null publiserte aktiviteter, én publiseringsindeks og
  tre aktive triggere. Heis er begrenset til polygon; park og akebakke er
  begrenset til punkt.
- Radantall for eksisterende tabeller var uendret, bortsett fra `audit_log`,
  som økte fra 1400 til 1411 med de 11 forventede opprettelseshendelsene.
- Den tomme schema-only-testgrenen ble slettet etter verifikasjonen. Lokal
  `.env.local` og `.neon` ble ikke endret.

Kontrollert SHA-256 for `database/schema.sql`:
`f9f8077d6a88161cdf9243a05420432fe8a32f126c1e4dd886d5dc377b27b4b2`.

## Nummer som tekst: fullført

Etter uttrykkelig godkjenning ble `activity_number` konvertert fra heltall til
tekst 30. september 2026. Dette gjør at alpinaktiviteter kan bruke nummer som
`A` og `1A`, i tillegg til rene tall.

- Schema-only-grenen `test-activity-number-20260930`
  (`br-lucky-smoke-b2wo8lvs`) bekreftet at eksisterende nummer `1` ble bevart
  som tekst, og at en syntetisk alpinaktivitet med nummeret `A1` kunne lagres.
- Snapshotet `pre-activity-number-text-2026-09-30`, ID
  `snap-fragrant-forest-b2douqa7`, ble opprettet fra produksjonsgrenen før
  migreringen.
- Ingen survey-, nyhetsbrev- eller matrikkeljobber var aktive før kjøringen.
- Skrivebeskyttet etterkontroll i produksjon bekreftet datatypen `text`, alle
  11 navngitte utkast og null publiserte aktiviteter.

## Applikasjon og tilbakeføring

Databasen er klar for aktivitetskartet. De 11 radene er kladder, og
aktivitetskartet er dessuten bevisst slått av på forsiden i denne
produksjonssettingen. Applikasjonsversjonen ble publisert fra commit
`091f5e3b99928f98f5d628b574ca9875bd3435d2` på Netlify 30. september 2026.

Ved en applikasjonsfeil beholdes det additive skjemaet og forrige deploy kan
reaktiveres. Ikke gjenopprett produksjonssnapshotet automatisk: en restore kan
overskrive legitim aktivitet som er opprettet etter snapshotet.

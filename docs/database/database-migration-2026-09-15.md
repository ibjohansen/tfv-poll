# Databasemigrering – 15. september 2026

**Status: Fullført og verifisert i produksjon 15. september 2026 kl. 21:50 UTC.**

Etter eksplisitt godkjenning fra prosjekteier er det testede skjemaet kjørt
med direkte databaseforbindelse og `APP_ENVIRONMENT=production`.
Første forsøk ble stoppet før oppstart i påvente av denne godkjenningen.
Ingen deploy, GitHub-push, Netlify-/Entra-endring eller sikkerhetsopprydding er utført.

## Migrering som er testet

- Eksisterende `npm run db:setup`, som kjører `database/schema.sql` i én transaksjon.
- Kodeversjon: `62e4eff`.
- SHA-256 for skjemaet: `bb166b145b294ad3a890ef31d15b4509ec8187e575af31e8535c815a39ce34a2`.
- Produksjonsgrenen og begge lokale databaseforbindelsene er kontrollert mot Neon.
  Databasens miljømarkør er `production`.
- Forhåndskontrollen viste ingen aktive Matrikkel- eller survey-e-postjobber,
  ingen aktive miljøløse medlemstoken og ingen gamle survey-rader som trengte
  datakonvertering. Kontrollen ble gjentatt umiddelbart før produksjonskjøring.

Migreringen la til blant annet worker-/forsøksfeltene for Matrikkel,
medlemsstatus og grend, kommentarer, fler-tomt-felter for lenker og sesjoner,
riktekst, e-postgrupper, nyhetsbrev og den samlede aktivitetsvisningen.
Det eksisterende skjemaet dekket disse endringene; SQL-koden trengte ingen retting.

## Utført verifikasjon

- [x] Opprettet `migration-check-20260915` med bare produksjonens skjema.
  Alle 23 eksisterende applikasjonstabeller var tomme før testdata ble satt inn.
  Ingen medlemsdata ble kopiert til testgrenen.
- [x] Kjørte migreringskommandoen tre ganger med `APP_ENVIRONMENT=development`.
  Gjentatt kjøring ga ingen ekstra audit-hendelser etter opprinnelig seed.
- [x] Kontrollerte bevaring av syntetiske eiendomsdata, survey-svar og
  spørsmålsversjon, artikkeltekst, medlemstoken og medlemssesjon.
- [x] Kontrollerte standardverdier for medlemsstatus, grend, kommentarer,
  worker-felt og fler-tomt-tilgang. Gamle tilganger ble ikke utvidet automatisk.
- [x] Testet nye grender, e-postgrupper, nyhetsbrev, riktekst, kommentarer,
  aktivitetsvisning, worker-oppdateringer og fler-tomt-sesjoner.
- [x] Kontrollerte avvisning av ugyldig medlemsstatus og for lang kommentar,
  samt UPDATE/DELETE/TRUNCATE-vern på audit-loggen og TRUNCATE-vern på sikkerhetsloggen.
- [x] `npm run check`: lint, 240 tester og produksjonsbygg bestod.

Testgrenen inneholder bare syntetiske data og slettes automatisk
16. september 2026 kl. 21:31 UTC. Lokale tilkoblinger er ikke endret.

## Gjenopprettingspunkt

- Navn: `pre-todo-migration-approved-20260915`.
- Snapshot-ID: `snap-dawn-tree-b2t6ri9d`.
- Opprettet: 15. september 2026 kl. 21:50:07 UTC, rett før migreringen.
- Utløper automatisk: 22. september 2026 kl. 21:50:05 UTC.

Det første snapshotet, `pre-todo-migration-20260915`
(`snap-blue-wildflower-b2ovqsl5`), ble også beholdt og utløper
22. september 2026 kl. 21:35 UTC. Ingen automatisk backupplan er endret.

Snapshotet oppbevares i Neon, ikke som en lokal databasedump.
Gjenoppretting er ikke testet eller kjørt. En gjenoppretting kan erstatte nyere
endringer og skal ikke utføres uten egen vurdering og godkjenning.

## Utførte produksjonssteg

- [x] Innhentet eksplisitt godkjenning til å migrere Neon-produksjonsdatabasen.
- [x] Kontrollert gren, miljømarkør, skjemaets kontrollsum og aktive jobber på nytt.
  Et ferskt snapshot ble opprettet rett før kjøring.
- [x] Sammenlignet radantall og kontrollsummer av alle eksisterende kolonner,
  uten å eksportere personopplysninger. Alle 23 opprinnelige tabeller var
  uendret, bortsett fra miljømarkørens forventede `updated_at` som var unntatt
  fra kontrollsummen. Alle 427 medlemsposter er bevart.
- [x] Kjørt `APP_ENVIRONMENT=production npm run db:setup` med direkte forbindelse.
  Hele skjemaet ble bekreftet fullført i én transaksjon.
- [x] Verifisert 20 forventede nye kolonner, fire nye tabeller og
  `admin_activity_log`. Alle eksisterende medlemmer har standardstatus `member`
  uten automatisk grendetilordning. Ingen ugyldige indekser ble funnet;
  append-only-triggerne på audit- og sikkerhetsloggen er aktive.
- [x] Bekreftet at alle constraints er validerte og audit-triggerne er aktive
  på alle sju aktuelle tabeller. Nye tabeller er tomme; gamle lenker/sesjoner
  har ikke fått utvidet tilgang, og gammel artikkeltekst er ikke konvertert.
- [x] Oppdatert denne statusen og ToDo etter bekreftet produksjonskjøring.

Første etterkontroll ble bekreftet kl. 21:50:09 UTC. Ingen testdata er lagt
inn i produksjon, og lokale eller Netlify-administrerte miljøvariabler er ikke endret.

`db:security-cleanup` er en separat, destruktiv opprydding og inngår ikke her.
Deploy og funksjonell produksjonsverifikasjon er også separate steg; se README.

Fremgangsmåten følger [Neons schema-only-veiledning](https://neon.com/docs/guides/branching-schema-only)
og [snapshot-dokumentasjon](https://neon.com/docs/cli/snapshots).

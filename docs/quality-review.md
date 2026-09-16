# Kvalitetsgjennomgang – 14.–15. september 2026

## Lokal leveranse og avgrensning

Endringene er implementert i arbeidskopien. Ingen produksjonsdeploy, push,
Neon-migrering, Entra-/Netlify-endring eller reell e-postutsending er utført.
Produksjonskontroller og valg om personvern/drift står fortsatt åpne i ToDo.

Implementert:

- Medlemsstatus, sikker fler-tomtstilgang via felles hoved-e-post, visuell
  kontaktgruppering, kommentarer med historikk/lest-status, grender og e-postgrupper.
- CMS-riktekst med begrenset JSON, serversanitering og trygg React-rendering.
  Eksisterende tekst vises bokstavelig, uten HTML-tolkning.
- Nyhetsbrevutkast, forhåndsvisning, testmail og deduplisert bakgrunnskø.
  Ingen åpnings- eller klikksporing.
- Matrikkel-reservasjoner, gjenopptaking, tidsfrister og watchdog. Oppstart
  krever direkte 202; samtidige starter serialiseres før snapshot opprettes.
- Append-only-beskyttelse for brukerlogg, aktør ved sensitive adminhandlinger,
  samlet e-posthendelsesvisning og minimal sikkerhetshendelse ved egeneksport.
- Åpen WFS/GML-adapter for teiger, kontrollert koordinattransformasjon,
  ukoblede registerposter med ukjent plassering utenfor mangeltall.
- CI med egne Postgres-/nettlesertester, favicon og repository-metadata.

## Konkrete feil funnet og rettet

Opprinnelig Matrikkel-worker kunne overskrive samtidig stopp, og desimal
batchstørrelse kunne nå SQL LIMIT. Senere kunne en avbrutt worker bli stående
som processing uten trygg gjenopptaking. Disse feilene er rettet med vilkår
i SQL, heltallsgrenser, tidsbegrensede worker-token og atomiske oppdateringer.

Et NOT EXISTS-vilkår alene hindret ikke to samtidige Matrikkel-starter.
Oppretting bruker nå transaksjonslås i en separat spørring før neste
READ COMMITTED-snapshot. Ekte samtidighetstest bekrefter én kjøring/backup.

Brukerloggens COUNT(*) ble tidligere feil destrukturert. Telling, sideinndeling,
bundne filterparametere og Oslo-datogrenser er rettet og testet.

Nettlesertester avdekket mobiloverflyt i gruppetabellen og at Tiptaps
setEditable utløste en innholdsoppdatering ved lagring. Dette markerte et
lagret nyhetsbrev som endret og sperret forhåndsvisning. Tabellbeholder og
editorhendelsen er rettet. Bekreftelsesdialoger har tastaturavgrensning,
Escape, fokusretur og separate tilgjengelighets-ID-er.

Survey-snapshot kontrollerer både klientversjon og gjeldende spørsmål i
samme SQL-innsetting. Endrede spørsmål gir konflikt, ikke feil snapshot.
Ny lasting nullstiller tidligere svar.

## Tester

Tre nivåer med ulike garantier:

- `npm run check`: lint, 240 modul-/rutetester og produksjonsbygg.
  Nettverk og DB erstattes eksplisitt i rutetestene. Fire faktiske
  bakgrunnsentrypoints importeres også i ren Node uten Auth/produksjonsmiljø.
- `npm run test:integration`: 33 tester i egen lokal Postgres med syntetiske
  data. Faktisk migrering to ganger, triggere, før/etter-redaksjon, engangsbruk,
  samtidige svar, medlemsstatus, kommentarer, flertomtstilgang, grupper,
  riktekst, kølevering, worker-krasj, stopp, godkjenning og watchdog.
- `npm run test:e2e`: 14 scenarier i både desktop og mobil (28 kjøringer).
  Isolert appkopi, ingen .env, ingen DB eller aktive e-postlegitimasjoner.
  Test-fixture-siden kopieres bare til den midlertidige appen og finnes ikke
  i produksjonsbygget. Virkelige komponenter brukes, med syntetiske props
  og simulerte API-svar for sensitive/muterende flyter.

Nettleserdekning: SurveyForm, MemberSelfServiceEntry, MemberSelfServiceProfile,
AdminMemberRequests, AdminMemberDirectory, AdminAuditLog, CMS-editor,
AdminMemberGroups, AdminNewsletters, SurveyEmailPanel og MapExplorer.
Inkluderer tastatur/fokus, mobil, utløp, validering, versjonskonflikt, lagringsfeil,
retry, kansellert utsending, oppstartsfeil, polygontegning/grenselag og eksport.

Det er ikke full E2E mot ekte Entra, Neon, MailerSend eller Netlify Functions.
CMS-filopplasting har rutetester, ikke en komplett nettleser-/Object Storage-flyt.
Safari/Firefox og fysisk mobil er ikke kjørt. Ingen dekningsprosent brukes som
erstatning for disse avgrensningene.

## API-dekning

Alle 37 route.js-filer under app/api og app/survey/api er representert.
Dette er rutefunksjons-/tjenestegrensetester, ikke full integrasjonsdekning.
Kartets tjenester/kilder er dokumentert i [kartveiledningen](map-explorer.md).

| Ruter | Testfil | Dekning |
| --- | --- | --- |
| `/api/admin/members`, `/[id]`, `/export` | `api-admin.test.mjs` | Lesing, oppretting, endring, sletting, Excel-respons, søk, validerings-/rettighets-/databasefeil |
| `/api/admin/member-requests/[id]` | `api-admin.test.mjs` | Behandling, matrikkeloppslag, konflikter og tilgang |
| `/api/admin/surveys`, `/[id]`, `/[id]/results`, `/[id]/results/export`, `/[id]/email` | `api-admin.test.mjs` | CRUD, resultat/eksport, testmail, kampanjestart, rategrense og feil |
| `/api/admin/cms/pages`, `/[id]`, `/[id]/status`, `/[id]/image`, `/[id]/attachments`, `/[id]/attachments/[attachmentId]` | `api-admin.test.mjs` | Alle eksporterte HTTP-metoder, filstørrelser, origin, tilgang og feil |
| `/api/admin/matrikkel/runs`, `/[id]`, `/[id]/process`, `/[id]/items/[memberId]/approve` | `api-admin.test.mjs` | Opprettelse, oversikt, behandling, godkjenning, stopp og sletting av logg |
| `/api/member-access/request`, `/verify`, `/profile`, `/export`, `/logout`, `/email-change/verify` | `api-public.test.mjs` | Generiske tilgangssvar, utsatt sending, cookies, øktavgrensning, input, rategrenser og feil |
| `/api/membership-requests`, `/verify` | `api-public.test.mjs` | Innsending, feil og bekreftelseslenker |
| `/api/cms/pages/[slug]`, `/api/cms/files/[id]` | `api-public.test.mjs` | Publisert innhold, private vedlegg, filhoder og lagringsfeil |
| `/api/webhooks/mailersend` | `api-public.test.mjs` | Faktisk HMAC-verifikasjon, endret payload, størrelsesgrense, ugyldig JSON og lagringsfeil |
| `/api/auth/[...nextauth]` | `api-public.test.mjs` | Kun delegering av GET/POST til Auth.js; OAuth-forløpet må integrasjonstestes |
| `/api/survey-access/verify`, `/survey/api/responses` | `api-survey.test.mjs` | Cookieutveksling, gyldige svar, øktavgrensning, ugyldige svar, origin, rategrense, honeypot og duplikater |
| `/api/admin/map/search`, `/api/admin/map/hamlets` | `map-api.test.mjs`, `map-hamlets.test.mjs` | Tilgang, CSRF, body-/tidsgrenser, cache, delvise svar og trygg grendekobling |
| `/api/admin/member-groups` | `member-groups.test.mjs` | Input, rolle/origin, CRUD og sikre feil; SQL i integrasjonstestene |
| `/api/admin/newsletters` | `newsletters.test.mjs` | Input, rettighet/origin, oppstartsfeil; kø og levering i integrasjonstestene |

## Hva logges og hvorfor?

[GitHubs administrative hendelser](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/audit-log-events-for-your-organization)
og [Microsoft Purviews aktivitetskategorier](https://learn.microsoft.com/en-us/purview/audit-log-activities)
brukes som mønster for aktør, handling, mål, tidspunkt og resultat, uten å
kopiere deres omfattende datainnsamling.

| Hendelse | Løsning |
| --- | --- |
| Medlems-/henvendelses-/CMS-/surveyendringer | Eksisterende audit-triggere, utvidet med profilkommentarer. Hemmeligheter redigeres bort. |
| Grender og e-postgrupper | Aktør, gruppe-ID/type og antall. Ingen kopiert medlemsliste i hendelsen. |
| Medlems-/resultateksport | Aktør, type, antall og utvalg. Ingen eksportinnhold. Loggfeil stopper levering. Kartmodulens eksport er fjernet. |
| Medlemmets egeneksport | Én security_events-hendelse for valgt tomt; ingen kopi av profilen. |
| Matrikkel-stopp, godkjenning og skjuling | Varig aktørhendelse i audit_log; overlever skjuling av kjøringen. |
| Kampanje/testmail | admin_activity_log viser metadata fra kampanjer/leveranser og bestillende aktør. Ingen e-postadresser eller innhold kopieres til visningen. |
| Admin-innlogging og rolle-/tilgangsendringer i identitetsplattformen | Entra-logger beholdes som kilde; ingen lokal kopi av OAuth-payload eller identitetshistorikk. |
| Avvist apptilgang | Eksisterende proxy-hendelse med område, resultat og tidspunkt. Ingen rå IP, token eller medlemsfelt. |
| Vanlig lesing/sidevisning | Ikke del av brukerloggen; anonym, aggregert bruksstatistikk lagres i et separat statistikksystem. |

Entra dokumenterer [innloggingshendelser](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/concept-sign-ins)
og [audit av blant annet brukere, grupper og apper](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/concept-audit-logs).
En avvisning fra appens egen rollepolicy er ikke det samme som en mislykket
Entra-innlogging; derfor beholdes den minimale apphendelsen. Vi har ikke
verifisert tilgang/lagringstid for den faktiske tenantens logger.

admin_activity_log er en avledet visning av nåværende kampanje-/leveringstider,
ikke et uforanderlig snapshot av hvert gjenopptakingsforsøk. audit_log har nå
UPDATE/DELETE/TRUNCATE-vern, men skjemaeieren kan deaktivere triggere. Separat
runtime-/vedlikeholdsrolle og vedtatt lagringstid krever ekstern avklaring.
Ingen automatisk sletting eller endring av produksjonsrettigheter er innført.

## Søk ved større loggmengder

`scripts/benchmark-audit.mjs` bruker den samme låste testdatabaseavgrensningen
som integrasjonstestene. Den legger til 100 000 syntetiske poster i en
transaksjon, kjører EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) mot den faktiske
admin_activity_log-visningen, og ruller alle målepostene tilbake.

Målt på lokal Postgres 17.4, 15.09.2026:

| Spørring | DB-tid | Plan |
| --- | ---: | --- |
| Sjelden delstreng, telling | 140,2 ms | Parallell sekvensiell gjennomgang |
| Vanlig delstreng, side 25 | 11,7 ms | Indeks og inkrementell sortering, LIMIT/OFFSET |
| Aktør og siste døgn, første side | 0,3 ms | Indeks og inkrementell sortering |

Dagens indekser og paginering beholdes på dette grunnlaget. Friteksttelling er
fortsatt lineær i loggmengden; det er ikke lagt til pg_trgm eller duplisert
persondata i en søkekolonne. Målingen er lokal og hovedsakelig varm cache,
uten Neon-nettverk, samtidighetslast eller millioner av rader. Ved målt treghet
i større volum bør trigramindeks og nøkkelbasert navigasjon vurderes på nytt.

## Uavklarte produktvalg

Reservasjon mot Turufjell AS: gjennomgangen fant kontaktfelter, administrativ
eksport og e-postutsending, men ingen egen integrasjon eller eksisterende
reservasjonsverdi. Koden viser ikke dagens manuelle delingspraksis. ToDo krever
at denne og standardverdien avklares først. Ingen antatt ja/nei-verdi er innført.

Intern bruksstatistikk: det minimerte første nivået er implementert som
dagsaggregater per tillatt sidetype og grov enhetskategori. Aggregatene beholdes
som historisk statistikk uten automatisk sletting; de har fast, lav kardinalitet
og inneholder ingen besøksidentifikator eller rå hendelse. Løsningen lagrer ikke rå URL/query, personlige lenker,
IP, cookies, medlems-/besøks-ID, user-agent eller referrer. `Do Not Track`
respekteres. Nettleser og operativsystem samles ikke inn; eventuell senere
utvidelse krever en ny produkt- og personvernvurdering.

Enkeltvisninger kan telles uten varig besøks-ID. Pålitelige besøkstall,
navigasjonsforløp og besøkstid krever mer sammenkobling; sideavslutning og
varighet kan ikke måles fullstendig når fanen/appen termineres eller nettverket
forsvinner. Ikke presenter estimater som presise tall. Rå referrer og URL-query
kan røpe personlige lenker. Derfor viser første nivå bare sidevisninger og
presenterer ikke besøk, sesjoner eller varighet som om de var presise.
Den additive `usage_daily_stats`-migreringen ble kjørt og verifisert 16. september
2026. Produksjonsinnsamling starter først når den nye applikasjonsversjonen er
eksplisitt godkjent og publisert.

## Ekstern verifikasjon som fortsatt krever godkjenning

- GitHub-påkrevd quality-status og PR-krav; workflow-filen setter ikke dette.
- Netlify-pakking, faktisk workerstart/watchdog og test av H-nummer 25.
- Reell Entra-rolle, delt ratebegrensning og kart-/medlemskobling med godkjent testgrunnlag.
- Lagringstid/privilegier og eventuell større driftsavtale for veidata.

Produksjonsprosedyren i README er oppdatert med nye ruter, funksjoner og
skjemaendringer. Den må følges før publisering; grønne lokale tester er ikke
en godkjenning til å utføre eksterne endringer.

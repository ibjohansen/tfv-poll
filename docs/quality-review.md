# Kvalitetsgjennomgang – 14.–15. september 2026

## Funn i Matrikkel-flyten, registrert før retting

- Oppdateringen til `running` og sluttellingen kontrollerte ikke om en annen
  forespørsel nettopp hadde stoppet kjøringen. En forsinket worker kunne derfor
  overskrive `cancelled` med `running` eller `completed`. Feilhåndteringen kunne
  tilsvarende overskrive status med `failed`. Rettes med vilkår på status i selve
  SQL-oppdateringen og lesing av gjeldende status hvis oppdateringen ikke treffer.
- Desimaltall i `batchSize` kunne bli sendt videre som SQL `LIMIT`. Normaliseres
  til heltall før spørringen.
- Brå avslutning av en worker kan etterlate elementer som `processing` uten
  tidsbegrenset reservasjon. Gjenopptakelse av slike kjøringer trenger en egen
  lease-/retry-løsning og samtidighetstester mot Postgres; se ToDo.

Enhetstestene erstatter database og Kartverket med syntetiske implementasjoner.
De kan bekrefte kontrollflyt og spørringsparametere, men kan ikke bevise låsing,
transaksjonsisolasjon eller at SQL faktisk kjører i Postgres.

## Implementert

- Rettet uttrekk av `COUNT(*)` i brukerloggen. Resultatet er en radliste; den
  tidligere destruktureringen ga `undefined` og dermed null treff og én side.
- Lagt til søk og filtrering i brukerloggen, med bundne SQL-parametere, validerte
  datointervaller i norsk tid og filtre som følger med ved sidebytte.
- Registrert genererte medlems- og resultatseksporter med et begrenset sett
  metadata i den eksisterende loggen. Filen returneres først når logging lykkes.
- Standardisert feilstatus fra adminruter: validering 400, manglende innlogging
  401 (enkelte eksisterende modulgrenser bruker 403), manglende rolle 403,
  ikke funnet 404, konflikt 409, ukjente tekniske feil 500 og enkelte utilgjengelige
  tjenester 503. JSON må være et objekt. Ugyldig JSON starter ikke en full sync.
- Kontrollert feilhåndtering ved medlemsverifikasjon og medlemseksport;
  ugyldige lenker renses fra URL og gamle cookies slettes.
- Beholdt eksisterende CI og avgrenset push-triggeren til `main`, i tillegg til
  pull requests. Dokumentert behovet for påkrevd statuskontroll i GitHub.
- Supplert ren tekst-versjonen av lenke-e-postene med kopier/lim inn-hjelp.
- Beskyttet survey-snapshot ved spørsmålendringer: skjemaet sender vist versjon,
  API-et avviser manglende/utdatert versjon, og SQL-innsettingen krever samme
  versjon som spørsmålsteksten den lagrer. Ved konflikt tilbys ny lasting og
  gamle svar forkastes. Ingen databaseendring er nødvendig.

## API-dekning

Alle 33 `route.js`-filer under `app/api` og `app/survey/api` er representert.
Dette er tester av rutefunksjonene og tjenestegrensene, ikke full ende-til-ende-
dekning av hver underliggende tjeneste.

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

`admin-access.test.mjs` tester de faktiske servervaktene mot tenant-, allowlist-
og rollepolicy og at eiendomsidentitet ikke kan endres via kontaktoppdatering.
`admin-audit.test.mjs` tester telling, sideinndeling, filtervalidering,
SQL-parametere, eksportmetadata og at eksport krever lagret logghendelse.

`matrikkel-sync.test.mjs` dekker nye kjøringer med snapshot, eksisterende tomter,
endrede og uendrede data, gjentatt behandling, flere rader for samme eiendom,
ufullstendige data, manglende adresse, fuzzy-treff, A5 og seksjoner, eksterne feil,
databasefeil, delvise batcher, slettet medlem og kansellering. Synkroniseringen
oppdager ikke nye tomter og sletter ikke tomter automatisk; det er derfor ikke
testet som eksisterende funksjonalitet. Manuell godkjenning og loggsletting er
dekket på rutenivå; deres transaksjoner trenger egne databasetester.

## Hva bør logges?

GitHub dokumenterer administrative handlinger som tilgangsendringer,
konfigurasjonsendringer og eksport av revisjonslogg, med aktør, handling og
tidspunkt. Microsoft Purview har tilsvarende hendelser for administrasjon,
filer og deling. Dette er et nyttig mønster for denne appen, uten at vi trenger
alle datafeltene disse produktene samler inn. Kilder:
[GitHub-hendelser](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/audit-log-events-for-your-organization),
[Purview-hendelser](https://learn.microsoft.com/en-us/purview/audit-log-activities),
[søk i Purview](https://learn.microsoft.com/en-us/purview/audit-search).

| Hendelse | Nåværende dekning / anbefaling |
| --- | --- |
| Endring av medlemmer, henvendelser, undersøkelser, svar og CMS | Eksisterende databasetriggere med aktør og før/etter. Behold. |
| Eksport av medlemsregister og resultater | Implementert nå med aktør, antall, type og utvalg. Ingen kopi av eksportinnhold. |
| Medlemslenker, tokenforbruk, e-postbytte, utlogging og rategrense | Flere hendelser ligger allerede i `security_events`. Unngå å kopiere dem som rå persondata til brukerloggen. |
| Testmail, kampanjestart, resend og avsluttet/feilet kjøring | Kampanjer og leveranser har egne tabeller. Legg senere til en samlet hendelsesvisning med referanse, aktør, resultat og antall; unngå dublering per mottaker. |
| Matrikkel-start, stopp, manuell godkjenning og skjuling av kjøringslogg | Kjøringene og endringene finnes delvis i egne logger. Registrer eksplisitt hvem som stopper/godkjenner/skjuler, og la revisjonssporet overleve skjuling. |
| Admin-innlogging, avvist tilgang og rolleendring | Innlogging/rolleadministrasjon håndteres i Entra. Avklar kobling til Entra-loggen; eventuelle apphendelser bør ha resultat og stabil aktør-ID, uten OAuth-payload. |
| Medlemmets eksport av egne data | Aktuelt som én hendelse i `security_events`, med medlems-ID og resultat, uten hele profilen. |
| Vanlig lesing, sidevisninger, IP og nettleserfingeravtrykk | Ikke lagt til. Dette er ikke nødvendig for endringshistorikken; eventuell bruksstatistikk er et separat produktvalg. |

`audit_log` er skrivebeskyttet i grensesnittet, men har ikke samme append-only-
trigger som `security_events`. En egen databaseendring bør vurdere rettigheter,
beskyttelse mot endring/sletting og en kontrollert løsning for vedtatt lagringstid.
Ikke innfør automatisk sletting eller ny innsamling av persondata uten avklart behov.

## Neste tester og avklaringer

1. Postgres-integrasjon i en schema-only testgren med syntetiske data: kjør
   migreringen to ganger; test faktiske audittriggere, før/etterverdier uten
   hemmeligheter, samtidig tokenforbruk, duplikatsvar og Matrikkel-stopp.
2. Survey-versjon mens skjemaet er åpent: versjonskontrollen er implementert og
   enhetstestet. Bekreft også mot faktisk Postgres at endrede spørsmål under
   innsending aldri gir feil snapshot, og test ny lasting av skjemaet i nettleser.
3. E-postkø og bakgrunnsfunksjoner: autentisering av jobbhemmelighet, retry etter
   timeout, dobbel invocation, leveringsfeil og idempotens. Ikke send ekte e-post.
4. Nettlesertester for de viktigste brukerreisene: personlig lenke, utløp og
   utlogging, kontaktendring/e-postbytte, medlemsbehandling, survey og CMS-upload.
   Ta med tastatur, fokus, feilfeedback og mobilbredde. Ingen automatiserte
   React-/nettlesertester er lagt til i denne endringen.
5. Søk i store brukerlogger: mål `EXPLAIN` på syntetiske data før valg av
   søkeindeks eller nøkkelbasert paginering. Dagens dato-/aktørfiltre kan benytte
   eksisterende indekser; fritekstsøket er et delstrengsøk i JSON-verdiene og har
   ikke egen søkeindeks. Ytelsen ved stor loggmengde er ikke verifisert.
6. Flere tomter per e-post: dagens oppslag krever ett treff, slik at e-postsøk
   med flere treff ikke sender lenke. Ny tilgangsmodell må teste både felles
   oversikt og at et e-postbytte aldri gir videre tilgang til feil tomt.

Reservering mot deling med Turufjell AS krever avklaring av eksisterende praksis
og standardverdi, slik ToDo beskriver. Den er ikke innført som en antakelse.

# Driftskostnader og sikkerhetsvalg – 3. oktober 2026

## Anbefaling

Publiser og mål før abonnement eller hvile endres. Prioriter trygge kode- og
cacheforbedringer først. «Alltid på» for Neon fjerner bare databaseoppvåkningen,
ikke nødvendigvis en kald Netlify-funksjon eller langsomme eksterne kall.
Ingen av alternativene nedenfor er aktivert, og ingen betalte innstillinger
eller sikkerhetspolicyer er endret i denne oppfølgingen.

Det ligger en åpen produksjons-/måleoppgave i `ToDo.md`. Admin-innboksen har
bare medlems- og matrikkelsaker; en generell driftsoppgave der ville krevd en
egen funksjonsutvidelse, ikke innsetting av en falsk matrikkelkjøring.

## Forutsetninger for prisene

Offentlige listepriser kontrollert 3. oktober 2026, USD før eventuell avgift,
valutapåslag og avtaler/rabatter. Faktisk Neon-plan, Netlify-plan og eksisterende
Microsoft-lisenser er ikke verifisert. Utviklingsarbeid er ikke inkludert;
det finnes ingen avtalt timesats å beregne dette med.

Neon Launch koster $0,106/CU-time, Scale $0,222/CU-time. Launch tilbyr fem
minutters hvile eller deaktivert hvile; egendefinert timeout krever Scale.
Lagring og andre forbruksposter kommer i tillegg. [Neon-priser](https://neon.com/pricing),
[timeout-vilkår](https://neon.com/docs/guides/scale-to-zero-guide).

Regneeksemplene bruker tidligere avlest minimum **0,25 CU**, **730 timer/måned**,
uten høyere autoskalering. Dette er et lavlast-estimat, ikke et fakturatak:
`CU-timer = gjennomsnittlig CU mens aktiv × aktive timer`.

| Alternativ | Illustrert compute-kostnad per måned | Effekt og begrensning |
| --- | ---: | --- |
| Behold fem minutter | Uendret innstilling. Ved 100 aktive timer: Launch **$2,65**, Scale **$5,55** | Billigst når databasen faktisk sover mye; kaldstart kan forekomme. 100 timer er et eksempel, ikke målt bruk. |
| Forleng til 15/30/60 minutter | Scale: **$5,55 / $16,65 / $40,52** ved henholdsvis 100/300/730 aktive timer | Tidene er bruksscenarioer, ikke en fast pris per timeout. Kostnaden avhenger av besøks-/jobbfordelingen. Oppgradering kan også gjøre øvrige compute-timer dyrere. |
| Deaktiver hvile, behold 0,25 CU minimum | Launch **$19,35**, Scale **$40,52** | Fjerner normal scale-to-zero-oppvåkning. Ved sammenligning med eksemplet på 100 timer blir økningen **$16,70 / $34,97**. |
| Alltid på, øk minimum til 0,5 CU | Launch **$38,69**, Scale **$81,03** | Mer kapasitet, men ikke anbefalt uten dokumentert CPU/minneproblem. |
| Alltid på, 1 CU | Launch **$77,38**, Scale **$162,06** | Kostnadsreferanse, ikke anbefalt dimensjonering for denne appen. |

Beregningene er egne overslag basert på satsene over. Tidligere avlest maksimum
8 CU er en skalagrense, ikke konstant forbruk. Andre compute-endepunkter og
testgrener teller separat. Differansen fra dagens faktura kan være nær null
dersom produksjonsdatabasen allerede er våken hele døgnet.

**Viktig kodefunn:** `background-watchdog.mjs` er planlagt hvert femte minutt og
spør databasen også uten besøkende. Hvis den faktisk kjører, kan den holde
compute våken eller gi svært korte hvileperioder. Ikke reduser frekvensen uten
å vurdere forsinket gjenopptaking av utsendelser/kvitteringer. Verifiser
scheduler og compute-historikk før kostnadsestimatet gjøres til budsjett.

Ved permanent aktiv Neon-compute anbefaler Neon også planlagt restart for
oppdaterte compute-images. «Alltid på» er dermed ikke helt vedlikeholdsfritt.
[Driftsvilkår](https://neon.com/docs/guides/scale-to-zero-guide).

### Alternativer på Netlify og i applikasjonen

| Alternativ | Kostnadsanslag | Vurdering |
| --- | --- | --- |
| Behold hosting, bedre datacache/importer/spørringer | Ingen nødvendig ny abonnementskostnad; vanlig bruk faktureres som før | Førstevalg. Deler er allerede implementert lokalt. Mål etter deploy. |
| Cache en offentlig, upersonlig forside ved CDN | Ingen nødvendig ny tjeneste; kode- og testarbeid | Større endring: dagens forespørselsspesifikke CSP-nonce og språk/query-varianter må håndteres korrekt. Aldri cache private medlemssvar offentlig. |
| Plasser funksjon nær Neon | Avhenger av eksisterende plan og region | Kontroller faktisk funksjonsregion først. Ingen dokumentert regionkonflikt her ennå. |
| Mer funksjonsminne/CPU | Eksempel: 10 000 kall à 1 sekund: 1 GB ≈ **27,78 credits**, 2 GB ≈ **55,56 credits** | Kan hjelpe CPU-tung kode, ikke nødvendigvis databaseventing. Mer kapasitet krever relevant Pro/Enterprise-plan. |
| Periodiske «hold varm»-kall | Eksempel hvert 4. minutt: **10 950 kall/måned**, ved 1 GB/1 sekund ≈ **30,42 compute-credits**, pluss forespørsler/data | Ingen garanti for at neste besøk treffer samme funksjonsinstans. Kan samtidig gjøre Neon til en 24/7-kostnad. Ikke anbefalt førstevalg. |
| Flytt til kontinuerlig kjørende appserver | Krever eget tilbud/dimensjonering | Fjerner denne typen funksjonskaldstart, men gir nye patch-, backup-, overvåkings- og tilgjengelighetsoppgaver. Ikke rettferdiggjort av to målinger. |

Netlifys credit-planer har Free $0/300 credits, Personal $9/1000 og Pro fra
$20/3000 per måned. Dette er **total planpris**, ikke et tillegg til nåværende
plan. Legacy-avtaler kan ha andre vilkår. [Netlify-priser](https://www.netlify.com/pricing/).

Compute er 10 credits/GB-time. Ekstra credits selges i pakker: Personal
$5/500, Pro $10/1500. Eksemplet på 27,78 credits tilsvarer omtrent $0,28/$0,19
av slike pakker, ikke en separat minste faktura; med ledige inkluderte credits
blir det ingen ekstra betaling. Produksjonsdeploy bruker 15 credits, og
trafikk/data kommer i tillegg. [Forbruksregler](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/).

Netlify dokumenterer region- og ressursinnstillinger, men en oppgradering til
Pro er ikke en garanti mot kaldstart. Cache gjør at en respons kan leveres uten
å kjøre funksjonen. [Funksjonskonfigurasjon](https://docs.netlify.com/build/functions/configuration/),
[caching](https://docs.netlify.com/build/caching/caching-overview/).

## Sikkerhet: ikke én samlet «rett frem»-rettelse

«Ingen ny fast kostnad» nedenfor betyr ikke gratis utvikling, tester, lagring
eller e-postforbruk. Listen er en vurdering, ikke en påstand om fullført arbeid.

| Funn | Konsekvens / avklaring før lukking | Kostnad |
| --- | --- | --- |
| F-01 | Teknisk håndterbart, men feil oid/tenant/rolle kan låse alle ute. Kartlegg faktiske administratorer, roller og nødkonto før overgang. | Normalt ingen egen appkostnad; gruppetildeling/lisenser må kontrolleres. |
| F-02 | Ny autentisering ved eksport, masseutsending og andre høyrisikohandlinger gir flere innloggingssteg. MFA-policy og fersk autentisering må bekreftes hos Entra, ikke bare i UI. | Gratis grunnvern eller P1/P2, se nedenfor. |
| F-03 | Rute-/unntaksmatrise og retest er oversiktlig kodearbeid. For streng regel kan stoppe webhooks/jobber og legitime skriv. | Ingen nødvendig ny tjeneste. |
| F-04 | Separate hemmeligheter og koordinert rotasjon. Gammel worker og ny dispatcher må virke under overgangen. | Ingen normal lisenskostnad; deploy/forbruk. |
| F-05 | Tokenbruk flyttes fra GET til eksplisitt POST. Brukeren får et ekstra bekreftelsessteg; gamle lenker og e-postskannere må testes. | Ingen nødvendig ny tjeneste. |
| F-06 | Produktvalg avklart: adresse, H-nummer og gnr/bnr kan vises. Test at navn, e-post og interne data ikke følger med. | Ingen ny tjeneste. Ikke fjern de godkjente feltene. |
| F-07 | Distribuert vern må skille misbruk fra felles IP og kjente H-numre. For stramt vern kan stenge ute uskyldige medlemmer. | Kan bruke eksisterende database/plattform, med ekstra forbruk. Ekstern kvotetjeneste er et eget valg. |
| F-08 | Varig kø/idempotens og generisk raskt svar; medlemmet ser ikke umiddelbart intern kontrollstatus. En løs asynkron callback alene er ikke tilstrekkelig leveringssikkerhet. | Mer bakgrunns-/databaseforbruk, ikke nødvendigvis nytt abonnement. |
| F-09 | Lokal suppression med webhook og reparasjonssynk. Bestem maksimal foreldelse og sikker oppførsel ved leverandørfeil. | Planlagte kall/compute; kan være innenfor eksisterende kvoter. |
| F-10 | Filstrukturkontroll er vanlig kodearbeid. Skanner/karantene er større: eldre Office/ZIP kan avvises og publisering forsinkes. Velg tillatte formater og behandling av private filer. | Skannertjeneste eller egen skannerdrift prises først etter volum/leverandørvalg. Ikke last opp private dokumenter til en offentlig analyseportal. |
| F-11 | Kortere preview-levetid og formålsdelte nøkler er avgrenset. Delte lenker utløper tidligere; individuell tilbakekalling krever mer tilstand. | Ingen nødvendig ny tjeneste; evt. databaseforbruk. |
| F-12 | Runtime-rolle og migreringseier skilles. Manglende rettigheter kan stoppe legitime flyter; retention/sletting er et eget styrevedtak. | Roller i eksisterende Postgres trenger normalt ingen egen tjeneste. Backup-/lagringskostnad avhenger av policy. |
| F-13 | Transaksjonell utboks og nye varsler må tåle retry og sperrede/avdøde kontakter. Gammel eier skal ikke få unødvendige opplysninger om ny eier. | Flere e-poster og jobbkjøringer innenfor eller utover eksisterende kvoter. |
| F-14 | Skann/metadatafjerning er gjennomførbart. Historikkomskriving endrer commit-ID-er og krever koordinering; eksisterende kloner forsvinner ikke. | Verktøy kan kjøres lokalt; hovedkostnad er arbeid. Egen godkjenning før force-push. |
| F-15 | CI/CodeQL/branch protection. En obligatorisk annen godkjenner kan stoppe enmannsdrift; utpek eier og nødprosedyre. | Avhenger av repoets synlighet og GitHub-plan; private repos kan kreve betalt sikkerhetstillegg. |
| F-16 | CSP/COOP/sandbox må testes med Entra, kart og CMS. HSTS preload binder hele valgt domene/subdomener og er tregt å reversere. | Ingen nødvendig ny tjeneste; eventuell rapportmottaker/lagring. |
| F-17 | Delt rate limit/WAF for statistikk. Overbeskyttelse kan gi manglende statistikk; personvern må beholdes. | Bruk tilgjengelig plattformvern først. Mer avansert WAF kan kreve tilbud/oppgradering. |
| F-18a | Behold første tellende svar og hovedadressekvittering. Test binding til invitasjon og tomt; ikke svekk svindelvernet. | Ingen ny tjeneste utover eksisterende kvitteringer. |
| F-18b | Produktvalg avklart: registrerte adresser på samme tomt kan se hverandre. Test isolasjon mellom tomter og ved eierskifte; en felles adresse må ikke slå tomtene sammen. | Ingen ny tjeneste. |
| F-18c | Skille sporbarhet fra kopier av hele svar i audit. Bestem hva som beholdes før anonymisering/sletting; append-only-historikk endres ikke ad hoc. | Mest arbeid, evt. lavere lagringsbruk; ingen garantert besparelse. |
| F-18d | Lokal brukerinitiert kartlasting finnes. Reell produksjonstest og informasjon til brukeren gjenstår. | Ingen nødvendig ny tjeneste. |
| F-19 | Reject av placeholder/gjenbruk, eier/utløp/rotasjon. Feil produksjonskonfigurasjon skal stoppe trygt, så utrulling må koordineres. | Ingen nødvendig ny tjeneste. |

GitHub fakturerer avanserte sikkerhetsprodukter etter tilgang/aktive bidragsytere;
kontroller repo/plan før aktivering. Netlify tilbyr grunnleggende rate-limit-regler
på standardplaner, mens mer avansert vern varierer.
[GitHub-vilkår](https://docs.github.com/en/billing/concepts/product-billing/github-advanced-security),
[Netlify-planer](https://www.netlify.com/pricing/).

## Detaljering av avklaring 4

### A. Hvem får administratorrettigheter, og hvilken MFA-policy?

Du/styret godkjenner navngitte administratorer og hvilke oppgaver de skal kunne
utføre. En person med rettigheter i Microsoft-tenant gjennomfører tildelingen.
Vi trenger bekreftet tenant, object-ID-er for disse kontoene, rollefordeling og
en testet gjenopprettingsprosedyre. E-post er fortsatt visning/kontakt, ikke
stabil identitet. Ikke lim inn hemmeligheter i oppgaveloggen.

Anbefalt rekkefølge er å konfigurere/tildelte roller først, teste en begrenset
pilot, og deretter aktivere obligatorisk oid/rolle-kontroll. Nødtilgang må være
en kontrollert Microsoft-prosedyre, ikke en skjult omgåelse i appen.

Security Defaults er gratis grunnleggende MFA, men er ikke det samme som
appspesifikk step-up ved en bestemt handling. Conditional Access krever P1;
risikobasert policy krever P2. Listepris er **$6/P1-bruker/måned** eller
**$9/P2-bruker/måned**, årsforpliktelse. Fem relevante administratorer gir
illustrativt **$30/$45 per måned** dersom lisensene ikke allerede inngår.
Eksisterende Microsoft 365-pakker kan inkludere dette; ikke kjøp før kontroll.
[Security Defaults](https://learn.microsoft.com/en-us/entra/fundamentals/security-defaults),
[Conditional Access-lisenser](https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview),
[Microsoft-priser](https://www.microsoft.com/en-us/security/business/microsoft-entra-pricing).

Forslag til produktvalg, ikke aktivert: fire timers adminøkt og fersk
autentisering siste 15 minutter ved full eksport, masseutsending, permanent
sletting og rettighetsendring. Entra-claims/innloggingsflyt må testes; `amr`
alene kan ikke antas å være tilstrekkelig MFA-bevis i alle tokenvarianter.

### B. Hvem eier hemmelighetene og når kan de roteres?

Utpek en driftsansvarlig med Netlify-/leverandørtilgang og en reserve. Godkjenn
hvilke jobber som får egne nøkler, rotasjonsvindu og varsling ved feil. Nøkler
genereres tilfeldig og lagres bare server-side i riktig produksjonskontekst.

Trygg overgang: mottaker godtar gammel og ny nøkkel i en kort dokumentert
periode → dispatcher tar i bruk ny nøkkel → bekreft reell jobbkjøring → fjern
gammel nøkkel. Ved kompromittering må gammel nøkkel avvises straks; det kan
kreve pause/restart av jobber. Ingen verdi skal skrives i Git eller rapport.

Dette er normalt ingen abonnementskostnad. Konsekvensen av feil rekkefølge er
stoppede utsendelser/matrikkeljobber, derfor er dette en egen utrulling.

### C. Hvilke data skal beholdes, og hvor lenge?

Du/styret godkjenner formål og lagringstider; regnskapsansvarlig/juridisk
kompetanse bør involveres der oppbevaringskrav er relevante. Vi trenger separate
valg for utløpte tokens/økter, sikkerhetshendelser, leveringslogger, medlems- og
eierskiftehistorikk, individuelle undersøkelsessvar, audit og backup.

Et utgangspunkt til diskusjon, **ikke vedtatt eller juridisk konklusjon**:
rydde utløpte tekniske tokens etter en kort feilsøkingsperiode, behold
leveringslogger i en avgrenset periode som dekker klager, og anonymiser
individuelle svar når kontroll-/innsigelsesbehovet er avsluttet. Behold
aggregerte resultater separat. Tallfestede frister må vedtas per datatype,
inkludert unntak ved pågående sak og når sletting slår gjennom i backup.

Implementer først en tørrkjøring som viser antall berørte rader, test på
isolerte syntetiske data, og godkjenn første faktiske sletting særskilt.
Kortere retention kan redusere lagring, men er ikke en kostnadsoptimalisering
som bør overstyre dokumentasjonsbehov eller revisjonsspor.

## Beslutningsrekkefølge

1. Deploy/retest og måling, uten betalte endringer.
2. Kodearbeid som bevarer vedtatt produktatferd: F-03, F-05, F-11,
   felt-/tomtegrensetester og resten av F-16.
3. Planlegg F-01/F-02/F-04/F-12/F-19 som koordinerte tilgangs-/driftsendringer.
4. Velg filer/skanner, retention, varsling og GitHub-godkjenner før de berørte
   tiltakene sluttføres. Ikke marker hele sikkerhetslisten som lukket etter deploy.

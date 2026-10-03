# Kodegjennomgang 3. oktober 2026

## Omfang og status

Filinventaret i `app`, `components`, `lib`, `data`, `netlify` og `scripts`
omfattet 309 filer. Gjennomgangen brukte importanalyse, tekstsøk, målrettet
kodegjennomgang og automatiserte tester. Dette er ikke bevis for at enhver feil
er funnet, eller at hele sikkerhetslisten og språkmigreringen er ferdig.

Det er utført lokale kodeendringer og lesende produksjonskontroller. Ingen
e-post er sendt, ingen produksjonsinnstillinger/databaseobjekter er endret,
og det er ikke pushet eller deployet i denne gjennomgangen. Forrige arbeidsøkts
produksjonsimport skal ikke kjøres på nytt.

## Nettadresse og sesong på aktiviteter

Lesende databasekontroll fant sesong på alle 29 aktive aktiviteter og
nettadresse på ti, i samsvar med importgrunnlaget. Manglende nettadresser på
de øvrige er derfor ikke i seg selv importfeil.

Feltstøtten lå i lokal, upublisert kode og er nå committed sammen med
importarbeidet i `e021c32`. En ny regresjonstest bruker fullt databaseskjema i
PGlite og tjenestens faktiske SQL: opprett, oppdater, les gjennom admin og
offentlig tjeneste, og tøm feltene. Begge feltene overlever rundreisen.
Nettlesertestene dekker feltene og sesongfilteret på desktop/mobil.

Et separat datatap med lokal implementasjon ble ikke reprodusert. Deployert
kode må oppdateres og feltene verifiseres der før produksjonssaken kan lukkes.

## Utførte kodeforbedringer

- Fjernet ubrukt `components/SiteMenu.js`, ubrukte etikettkonstanter i
  `lib/usage-metrics.js` og en utilgjengelig visningsgren i `MemberInfo`.
  Komponenten kan gjenopprettes fra Git-historikken.
- Skilt lett aktivitetsvisning fra tung geometri-validering i
  `lib/activity-map-display.js`, og skilt `MapError` fra geometriimplementasjonen.
- Flyttet CMS-skjemaets datanormalisering til `lib/cms-editor.js`.
- Samlet paletten for admin- og e-postgrafer i `lib/survey-chart-style.js`.
  Styrets godkjente resultattekst er flyttet uendret til
  `data/survey-results-message.js` som redaksjonelt innhold.
- Aktivert ESLint `no-undef` for applikasjonskoden. Nettlesertesten avdekket en
  manglende import i kartpanelet som tidligere lint-oppsett ikke fanget.
- Innført `lib/browser-http.js` / `components/useApiClient.js` for interne
  nettleserkall: relative URL-er, blokkerte redirect, tidsavbrudd, avbrytelse,
  lokaliserte transport-/formatfeil og ingen automatisk gjentakelse av skriving.
  Admin-, medlems-, survey-, CMS- og aktivitetskomponenter og kartadapteren
  bruker denne. Anonym bruksstatistikk beholder best-effort-transport uten cookies.
- Eksterne tjenester beholder egne adaptere, adskilt fra intern klient.
  CMS-handlinger viser nå feil fra avviste løfter; mislykket rekkefølgeendring
  av vedlegg gir ikke falsk lokal lagring.
- Felles JSON-leser kontrollerer medietype, faktisk byteantall og objektform.
  Offentlige grenser: medlemstilgang 4 KiB, innmelding/profil 32 KiB,
  surveyinnsending 64 KiB og bruksstatistikk 4 KiB.
- Sentral origin-kontroll i admin-proxy og nettlesermutasjoner. Hosted
  mutasjoner krever godkjent `Origin`; request-vert er ikke tillitsanker.
- Bakgrunnsjobber bruker konfigurert HTTPS-origin i produksjon, ikke innkommende
  request-vert. Hemmeligheter er ikke rotert eller splittet i denne runden.
- Lokale rate-limit-tabeller har størrelsesgrense/opprydding og IPv6 /64.
  Dette er per-instans reservevern, ikke distribuert DDoS-beskyttelse.
- Eiendomskart sender ikke adressen til Geonorge før brukeren åpner kartet.
  Adapteren begrenser vert, tid og koordinater; iframe har sandbox/no-referrer.

Ikke alle lokale konstanter/funksjoner bør flyttes til globale filer. Delte
domeneregler og adaptere skilles ut; ren lokal rendering kan ligge med komponenten.

## Språk: forbedret, ikke komplett

CMS-editor/directory/preview, loading/error-visninger, filruter, nettverksfeil,
surveytilgang og kartinformasjon har fått nb/en-variabler. En ugyldig URL-kodet
språk-cookie krasjer ikke lenger request-håndteringen.

Følgende gjenstår og er ikke fremstilt som fullført:

| Område | Funn / anbefalt oppfølging |
| --- | --- |
| `lib/email-templates.js` | Systemtekst i e-post er fortsatt norske litteraler. Flytt til e-postordbøker; behold styregodkjent innhold som redaksjonelle data. |
| `lib/member-workbook.js` og andre eksport-renderere | Enkelte kolonneoverskrifter, arkfaner og eksportetiketter er hardkodet. |
| `lib/matrikkel-client.js`, `lib/matrikkel-sync.js` | Leverandørfeil og lagrede jobbmeldinger inneholder fritekst. Nye hendelser bør lagre kode/parametre og oversettes i UI. |
| `lib/mailer-service.js` og bakgrunnsjobber | Enkelte diagnostiske/statusmeldinger er fritekst. Offentlige svar skal bruke trygg kodebasert oversettelse, ikke rå leverandørfeil. |
| Databasehistorikk | Historiske fritekstmeldinger er ikke omskrevet eller slettet som språkrydding. |

Interne feilkoder/logghendelser, brukerskrevet innhold, adresser og stedsnavn er
ikke UI-etiketter. Et tekstsøk alene skiller ikke disse sikkert fra visningstekst.

## Cache, skalering og produksjonstreghet

Offentlige artikkelsider og artikkel-API deler nå femminutters datacache.
Forsidens cache er samlet i `lib/public-queries.js`; tunge tjenester importeres
inne i cache-funksjonen. CMS/aktiviteter invalideres umiddelbart ved endring og
avpublisering, så en ny stale kopi ikke serveres etter avpublisering.

Personlige medlemsdata, tilgangsbeslutninger og mutasjoner er ikke offentlig
cachet. HTML med forespørselsspesifikk CSP-nonce er heller ikke gjort til delt
CDN-cache. Endringene beholder denne sikkerhetsgrensen.

`pg_stat_statements` er ikke installert i produksjonsdatabasen. Ingen utvidelse
ble opprettet og ingen statistikk nullstilt. SQL-kostnad/egress er derfor ikke
rangert med faktiske produksjonsmålinger. Nye indekser og større SQL-omskrivinger
bør bygge på spørringsplaner og last, ikke antakelser.

To påfølgende, lesende GET-kall til forsiden ga HTTP 200:

| Måling | Første kall | Neste kall |
| --- | ---: | ---: |
| Tid til første byte | 7,558 s | 1,237 s |
| Total tid | 7,617 s | 1,338 s |

Responsen hadde `private, no-cache, no-store` og CSP-nonce. Målingen skiller
ikke tid brukt på Netlify, databaseoppvåkning og spørringer.

Neon viste `suspend_timeout_seconds: 0` på produksjonscompute. Det betyr
standard fem minutters inaktivitet før hvile, **ikke** at hvile er deaktivert;
se [Neons offisielle API-veiledning](https://github.com/neondatabase/ai-rules/blob/main/neon-api-projects.mdc).
Netlify beskriver også [varme og kalde funksjonsstarter](https://docs.netlify.com/build/caching/caching-overview/).
Begge er plausible bidrag, men dette beviser ikke at én av dem forklarer alle
7,6 sekundene. Datacache støttes av [Netlifys Next-integrasjon](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

Etter deploy: mål flere besøk etter inaktivitet og korreler med funksjons-/compute-
tidsstempler. Vurder deretter om mindre hvile er verdt mulig høyere kostnad.
Ingen kostnadsdrivende produksjonsinnstillinger er endret.

## Kontroll mot ToDo-security.md

«Delvis» betyr ikke godkjent i produksjon. Originale avkrysningspunkter beholdes
til egne ferdigkriterier og nødvendig retest er oppfylt.

| Funn | Status og gjenstående |
| --- | --- |
| F-01 | Åpent: admin bruker fortsatt e-post/tenant; stabil oid-allowlist og obligatoriske Entra-roller krever overgang. |
| F-02 | Åpent: ingen ny step-up/MFA-flyt; leverandørpolicy er ikke verifisert. |
| F-03 | Delvis: sentral origin-kontroll, proxyvern og bounded JSON. Full rute-/unntaksmatrise og staging-retest gjenstår. |
| F-04 | Vertslåsing rettet/testet. Separate jobbhemmeligheter og rotasjon gjenstår. |
| F-05 | Åpent: engangstoken kan forbrukes i GET-flyter; eksplisitt bekreftelses-POST og flyttester trengs. |
| F-06 | Åpent: offentlig kart inneholder eiendomsidentifikatorer/adresser. Avklar produktnivå før fjerning. |
| F-07 | Delvis: bounded lokale tellere og IPv6 /64 rettet. Identifikatorkvoters utestengingsrisiko og distribuert policy gjenstår. |
| F-08 | Åpent: innmelding gjør fortsatt arbeid før generisk 202; timingforskjeller er ikke fjernet. |
| F-09 | Åpent: lokal suppression finnes, men offentlige flyter kan gjøre leverandøroppslag. |
| F-10 | Eksisterende filgrenser/signaturkontroll. OOXML kontrolleres bare som ZIP, eldre Office tillates, ingen ny skadevareskanner. |
| F-11 | Åpent: preview-signering/levetid er ikke endret. |
| F-12 | Åpent: runtime-privilegier/retention er ikke endret eller fullstendig verifisert i produksjon. |
| F-13 | Eksisterende varsel ved hovedadresseendring; ingen ny komplett outbox for alle kontakt-/eierskiftevarsler. |
| F-14 | Aktiv kode/importdokument ryddet. Full historikkskann, historikkomskriving og fotometadata-gjennomgang ikke utført. |
| F-15 | Patchede avhengigheter, CI-audit, ukentlig Dependabot og SHA-pinnede actions. GitHub-innstillinger/branch protection/CodeQL ikke aktivert. |
| F-16 | Delvis: X-Powered-By deaktivert, proxyens produksjonstiming fjernet, kartiframe sandboxet. Reell Entra-/kartkompatibilitet og CSP/HSTS-policy trenger retest. |
| F-17 | Delvis: lokal frekvensgrense og liten request-grense. Ingen ny distribuert WAF-policy. |
| F-18a | Første tellende svar/hovedadressekvittering bevart; svindelvernet er ikke redusert. |
| F-18b | Mottakerliste i invitasjon er uendret; personvern-/produktvalg gjenstår. |
| F-18c | Surveyinnhold i audit er ikke slettet/omskrevet; retention/minimering må avklares. |
| F-18d | Lokal rettelse: brukerinitiert adresseoppslag, begrenset adapter og personverninformasjon; syntetisk nettlesertest. |
| F-19 | Eksisterende miljø-/lengdevalidering; ingen komplett ny placeholder-/gjenbrukspolicy for hemmeligheter. |

Den eldre rapportens «ingen høye/kritiske funn» gjelder dens tidspunkt/omfang.
Her ble nyere kritisk Next- og høy brace-expansion-advarsel funnet. Next er
oppdatert til 16.3.8, brace-expansion til patchede 1.1.21/2.1.7-varianter.
Ingen påstand om utnyttelse i denne appen.

## Verifikasjon

- `npm run check`: lint, 402 tester og full produksjonsbuild bestått.
- Faktisk aktivitetstjeneste/SQL og fullt skjema er testet med PGlite, inklusive
  nettadresse/sesong-rundreise. Dette erstatter ikke Postgres-samtidighetstest.
- Playwright desktop/mobil: 90 bestått, to planlagte hopp over desktop-spesifikke
  tester på mobil. Alle 92 tester ferdig uten feil i siste kjøring.
- Lokalt produksjonsytelsesbudsjett bestått: varm forside TTFB ca. 16 ms,
  LCP 72 ms, JavaScript 581 795 byte; CMS-editor 936 208 byte. Ingen feilresponser,
  CSP-brudd eller nonce-avvik. Syntetiske data/loopback, ikke produksjons-SLA.
  Ingen sammenlignbar førmåling som beviser prosentvis forbedring.
- `npm audit`: null kjente sårbarheter, inklusive utviklingsavhengigheter.
- Separat nettverksbasert Postgres-integrasjonssuite er ikke kjørt: ingen lokal
  Postgres eller Docker er tilgjengelig. Produksjon eller kopi med medlemsdata
  skal ikke brukes som erstatning. CI har isolert Postgres.
- Ingen belastningstest, penetrasjonstest, full historikkskann eller reell
  Entra/MailerSend/Norgeskart-end-to-end-test mot produksjon er utført.

## Avklaringer

1. `PublicHomePage` bruker organisasjonsnummer 928968898, `AccountingReport`
   bruker 928968899. Hvilket er riktig? Ingen gjetting er lagt inn.
2. Ønskes endret Neon-hvile mot mulig høyere kostnad? Mål først etter deploy.
3. Hvilke eiendomsidentifikatorer skal være offentlige (F-06), og skal
   invitasjoner vise de andre mottakeradressene (F-18b)?
4. Hvem godkjenner oid-/MFA-overgang, jobbhemmeligheter og retention?
   Dette er egne utrullinger, ikke sideeffekter av kodeopprydding.

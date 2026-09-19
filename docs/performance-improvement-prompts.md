# Ytelsesgjennomgang og implementeringsprompter

Dato: 19. september 2026

## Målt utgangspunkt

En kald, ustrupet Chrome-måling av produksjonsforsiden ga LCP på 795 ms og TTFB på 692 ms. 87 % av LCP-tiden lå før første byte; bildet brukte bare 43 ms på å lastes. Forsiden lastet samtidig 52 nettverksressurser, og Kartverkets kartfliser utgjorde omtrent 3,8 MB. Next-bygg viser at alle sider, også forsiden og den statiske cookie-informasjonen, blir dynamisk serverrendret.

Kodegjennomgangen viser fire hovedårsaker:

1. Rotlayouten leser `headers()` og `cookies()` for språk, og forsiden kaller i tillegg `auth()`. Dermed må hele den offentlige siden produseres på serveren for hvert besøk.
2. Kartet monteres når det kommer innen 400 px fra synsfeltet. På vanlig skjerm skjer dette under første sidelasting, slik at Leaflet og mange kartfliser lastes før brukeren har bedt om kartet.
3. Adminsidene autentiserer først i siden og deretter på nytt i flere parallelle datafunksjoner. Medlemsregisteret kjører dessuten samme ikke-indekserbare fritekstuttrykk i både telle- og resultatspørringen.
4. Store klientmoduler er koblet til oversiktssidene selv når funksjonen ikke er åpnet. CMS-listen inkluderer for eksempel Tiptap-editoren fra start.

Mål etter tiltakene: offentlig LCP under 1,5 s på simulert mobil, varm TTFB under 300 ms, ingen kartfliser før brukeren åpner kartet, og synlig respons på adminnavigasjon innen 200 ms med innhold som strømmes etterpå.

## P0 – gjør offentlig skall cachebart

```text
Analyser og bygg om offentlig rendering i Next.js 16 slik at forsiden og publiserte CMS-sider får et statisk/cachebart skall. Fjern auth() fra app/page.js; lenken kan alltid gå til /admin/login, som allerede videresender innloggede brukere. Isoler språkavhengigheten som i dag ligger i RootLayout via getServerI18n(), fordi headers()/cookies() i layouten gjør alle ruter dynamiske og blokkerer loading.js. Les node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md og veiledningen for instant navigation før implementering. Vurder URL-basert språk eller et lite dynamisk språksegment bak Suspense; ikke aktiver cacheComponents uten å migrere og teste hele appen. Behold norsk som standard, språkbytte og korrekt html[lang]. Akseptanse: next build markerer minst / og /informasjonskapsler som statiske eller dokumentert cachede; uinnlogget forside gjør ingen Auth.js-kall; språkbytte virker; alle eksisterende tester og en ny cache/regresjonstest passerer.
```

## P0 – last kartet først på uttrykkelig forespørsel

```text
Endre PublicHamletMap slik at Leaflet-modulen og Kartverkets fliser ikke lastes ved vanlig scrolling eller initial sidelasting. Vis først grendevelger, forklaring og en tydelig «Åpne kart»-knapp; importer og monter PublicHamletMapView først etter knappetrykk. Behold en fullt brukbar tekst-/tabellflyt for valg av grend og eiendom uten kart. Ikke hent eiendommer før en grend velges. Akseptanse: produksjonslignende nettverkstest viser null forespørsler til cache.kartverket.no før «Åpne kart» aktiveres; kartet virker etter aktivering; tastatur og mobil er testet; LCP påvirkes ikke av kartpakken.
```

## P0 – fjern gjentatt autentisering per adminrequest

```text
Gjør Auth.js-sesjonsoppslaget request-memoisert med React cache() eller en tilsvarende Next.js 16-anbefalt servermekanisme. Behold autorisasjon i hvert servergrensesnitt, men sørg for at page.js og flere get*-funksjoner i samme request gjenbruker én verifisert sesjon i stedet for å dekode/kontrollere den flere ganger. Kartlegg spesielt /admin/members, /admin/inbox, /admin/members/newsletters og /admin/members/groups. Ikke flytt tillitsgrenser til klienten. Akseptanse: instrumentering viser ett autentiseringsoppslag per serverrequest; direkte API-kall er fortsatt autorisert; rolle- og tenanttester passerer.
```

## P1 – optimaliser søk og sideinndeling i medlemsregisteret

```text
Optimaliser getAdminMembers i lib/admin-members.js på en isolert Neon-gren. Mål dagens COUNT- og SELECT-spørringer med EXPLAIN (ANALYZE, BUFFERS) på realistisk datamengde. Erstatt strpos(lower(concat_ws(...))) med en vedlikeholdbar, indeksert søkerepresentasjon, for eksempel en generert normalisert kolonne med pg_trgm/GiST eller GIN. Behold søk i H-nummer, matrikkelnummer, adresse, navn, e-post og kommentar. Vurder COUNT(*) OVER() og cursor/keyset-pagination slik at telling og store OFFSET ikke skanner tabellen unødig. Legg migrasjonen idempotent i database/schema.sql og dokumenter produksjonsrekkefølgen. Akseptanse: samme søkeresultater og sortering som før; p95-spørring under avtalt budsjett; EXPLAIN før/etter dokumentert; integrasjonstester dekker norske tegn, SPG H-numre og alle filtre.
```

## P1 – gi adminsidene umiddelbart skall og strømming

```text
Legg meningsfulle loading.js-filer og/eller granulære Suspense-grenser rundt de langsomme datadelene i admin. AdminModuleHeader og navigasjon skal vises straks, mens tabell, oppgavetall og grafer kan strømmes separat. Flytt runtime-lesing ut av layoutnivå der det blokkerer samme segments loading.js. Unngå serialiserte waterfalls; start uavhengige dataforespørsler samtidig. Akseptanse: klientnavigasjon viser nytt sidetittel/skall innen 200 ms; hver treg seksjon har stabil skeleton uten layoutskift; feil i én sekundær teller skjuler ikke resten av siden.
```

## P1 – del store klientpakker etter brukerhandling

```text
Mål route-chunks med en bundle-analyzer som er kompatibel med prosjektets Next.js/webpack-oppsett. Last RichTextEditor/Tiptap dynamisk først når en CMS-side åpnes eller opprettes. Kontroller at Leaflet bare finnes på kartflater, Visx bare på statistikk og ExcelJS/AWS SDK bare i serverkode. Unngå barrel-import fra @turf/turf; importer dokumenterte delpakker/funksjoner dersom målingen viser reell gevinst. Akseptanse: før/etter-størrelser per berørt rute dokumenteres; CMS-listen kan åpnes uten Tiptap-chunk; ingen serverbiblioteker finnes i klientbundle; editor og kart har tilgjengelig lastestatus.
```

## P1 – unngå full serverrefresh etter lokale mutasjoner

```text
Gå gjennom router.refresh() etter lagring i AdminMemberDirectory, CmsPageDirectory og andre store adminmoduler. Oppdater lokal liste og detaljdata fra API-responsen, og revalider bare serverdata som faktisk kan ha endret seg. Bruk refresh kun når en dokumentert serveravhengighet krever det. Sørg for AbortController, siste-svar-vinner og tydelig lagrestatus. Akseptanse: automatisk lagring av ett felt starter ikke alle sidespørringer på nytt; fokus og scroll beholdes; en nettverkstest setter øvre grense for antall requests per lagring.
```

## P2 – reduser bilde- og karusellkostnad

```text
Revider HomeHeroCarousel og de 4,6 MB med kildebilder i public/carousel. Generer produksjonsvarianter med passende dimensjoner og moderne format, behold én prioritert LCP-ressurs, og hent neste bilde først rett før eller ved manuell navigasjon. Vurder å stoppe automatisk avspilling som standard; respekter prefers-reduced-motion. Kontroller Netlify/Next Image-cache, fordi målingen viste revalidering med cache-control public,max-age=0,must-revalidate for det optimaliserte bildet. Akseptanse: ingen nedlasting av hele karusellen uten interaksjon; LCP-bildet er oppdagbart i HTML og ikke lazy-loadet; visuell kvalitet og fotokreditering beholdes.
```

## P2 – gjør anonym statistikk billigere

```text
Mål kostnaden av POST /api/usage/pageview og recordUsagePageView, inkludert om hvert sidebesøk vekker en nedskalert Neon-compute. Behold dagens dataminimering (ingen cookie, IP, rå URL, bruker-ID eller referrer), men vurder kø/batching eller Netlify-loggbasert aggregering dersom databaseoppvåkning dominerer. Feil skal aldri forsinke eller påvirke siden. Akseptanse: requesten er fortsatt credentials: omit og fire-and-forget; personvernkrav beholdes; databasekall per visning og månedlig kostestimat dokumenteres.
```

## P2 – etabler varig måling og ytelsesbudsjett

```text
Legg til Server-Timing for auth, database og eksterne tjenester uten å eksponere persondata eller SQL. Registrer Web Vitals for LCP, INP og CLS med samme dataminimering som dagens statistikk. Lag en repeterbar Playwright-/CI-måling for /, /admin/members med mockdata og /admin/web. Sett budsjetter for TTFB, LCP, klient-JS og antall requests, og la CI varsle ved tydelige regresjoner. Dokumenter kald og varm måling separat; ikke bland lokal dev-ytelse med produksjonsbuild.
```

## Anbefalt rekkefølge

Start med cachebart offentlig skall og utsatt kart. De angriper henholdsvis de målte 692 ms før første byte og 3,8 MB tredjepartsdata. Deretter følger request-memoisert auth og databasesøket. Bundle-splitting, mutasjonsflyt og observabilitet bør gjøres etter at de nye målingene er på plass.


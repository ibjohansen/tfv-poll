# Kart og registerkontroll

Implementert lokalt 15. september 2026. Inngang: `/admin/map`.
Kartfunksjonen endrer aldri adresse-, matrikkel- eller kontaktfelter automatisk.
Et kontrollert grendepolygon utløser derimot en sikker rematch av den separate
`members.hamlet_id`-koblingen. Ingen import, migrering, produksjonsdeploy eller
ekstern konfigurasjonsendring utføres av kartfunksjonen. Fra 16. september kan
administrator eksplisitt lagre navn og polygon i eksisterende grender.
Den additive produksjonsmigreringen ble utført og verifisert 16. september.

## Bruk

1. Åpne **Kart og registerkontroll** fra administrasjonsmenyen.
2. Utvid **Søkepolygon**, velg **Tegn polygon**, klikk/trykk inn hjørner og
   velg **Fullfør polygon**.
   Kartet starter ved Turufjell, nær Istjernvegen, i Flå kommune.
3. Hent adresser, eiendomsgrenser, veier/stier og registersammenligning hver for seg. En feil
   i Overpass skal ikke hindre adressesøket.
4. Filtrer/sorter tabellene. Klikk en adresse, referanse eller vei for å zoome
   og vise detaljer. Slå kartlag av/på med avkrysningsboksene.
5. Rediger ved å dra hjørner eller endre koordinatlisten. Listen støtter også
   innsetting/fjerning av hjørner. Piltastene flytter kartet, og knappen for
   kartsenter legger til et punkt uten mus. Fullfør og hent data på nytt.
6. Velg en adresse eller teig. Ett entydig registertreff åpner medlemsdetaljene;
   flere kandidater vises for manuelt valg, og manglende treff opplyses tydelig.

Bare ett enkelt polygon uten hull støttes. Arealet må være 1 m²–25 km²,
maksimalt 200 hjørner og 5 km omsluttende søkeradius. Alle hjørner må ligge
innenfor 20 km av startpunktet. Disse er **applikasjonsgrenser**, ikke en
definisjon av Turufjells område eller leverandørenes API-kvoter.
Et ulagret søkepolygon finnes bare i sidens minne.
Administrator kan nå lagre polygonet som en navngitt grend i databasen.

### Grender og lagrede polygoner

Kartet står til høyre for grendeeditoren på større skjermer og under editoren
på smale skjermer.

1. Velg en eksisterende grend i **Lagret grend**, eller klikk grenden i kartet.
   Begge handlingene laster polygonet som gjeldende søkeområde, zoomer inn og
   henter offisielle adresser og eiendommer innenfor grensen. Kartlaget
   **Eiendommer** kan slås av og på. Grender uten polygon kan velges og deretter
   få et inntegnet område.
2. For en ny grend: velg **Ny grend**, tegn området, fullfør polygonet og oppgi
   grendenavnet. Velg **Lagre polygon som ny grend**. Grenden kommer i samme liste som under
   medlemsadministrasjonens **Grender og e-postgrupper**, ikke i et eget register.
3. Rediger hjørnene, fullfør og velg **Lagre grendeendringer**. Navnet kan også
   endres. Ulagrede endringer krever bekreftelse før bytte til en annen grend.
4. Når en lagret grend velges, avgrenses registerlaget med den lagrede
   `members.hamlet_id`-koblingen. Når et polygon lagres som kontrollert,
   beregnes koblingene for alle kontrollerte grender på nytt i bakgrunnen.
5. **Fjern lagret polygon** fjerner bare geometrien, ikke grenden eller
   medlemskoblingene. **Slett polygon** i tegneverktøyet fjerner bare det lokale
   søkeområdet. Sletting av selve grenden gjøres fortsatt i gruppeadministrasjonen.

Feltene for navn og manuell kontroll vises først når en eksisterende grend eller
**Ny grend** er valgt. Tegneverktøyet ligger i den kollapsede seksjonen
**Søkepolygon**, slik at det ikke tar plass ved vanlig registerkontroll.

**Grendegrenser** viser alle lagrede polygoner samtidig. Bare ett polygon brukes
til søk om gangen. Utkast vises stiplet og merkes «må kontrolleres».
Administrator kan bekrefte manuell kontroll av plasseringen; geometriendringer
i editoren opphever denne bekreftelsen. Dette gjør ikke grensen til en offisiell
matrikkelgrense. Lagrede polygoner er interne Turufjell vel-data, ikke Kartverket-data.
Valg av et polygon endrer ikke medlemmer. Lagring av et kontrollert polygon
starter en full rematch i en Netlify Background Function. Sikre treff kan
opprette eller flytte `hamlet_id`. En eksisterende kobling fjernes bare når et
eksakt offisielt adresse-/matrikkeltreff plasserer tomten entydig utenfor alle
kontrollerte grender. Uklare, overlappende eller utilgjengelige oppslag beholdes
for manuell kontroll. Nye tomter forsøkes automatisk koblet både ved direkte
adminoppretting og ved godkjenning av en offentlig innmelding.

Navn, GeoJSON-geometri, kontrollstatus, versjon og endringstid lagres i
`member_hamlets`. Den lagrede grendelisten leses fra databasen, ikke en hardkodet
liste i UI. De 11 opprinnelig digitaliserte områdene er kontrollert som aktive,
lagrede og manuelt godkjente polygoner i databasen. Det finnes derfor ingen
separat utkastkatalog eller utkastvelger i applikasjonen.

Samtidige endringer gir `409`, og editoren beholder utkastet. **Last grendelisten
på nytt** oppdaterer listen uten å overskrive utkast eller bytte dets versjon.
Bruk en fersk grend eksplisitt før ny redigering etter konflikt. Navneendring
eller sletting fra gruppeadministrasjonen gjør også en eldre editor utdatert.
Identiske navn avvises uten å opprette duplikater. Lagring og brukerlogg skrives
atomisk; loggen inneholder aktør, grend-ID, navn, versjon, kontrollstatus, areal
og antall hjørner, ikke koordinatlister eller medlemsdata. Ingen lokale
lagringsnøkler eller databaseforbindelser sendes til nettleseren.

## Integrasjon og dataansvar

Eksisterende Next.js App Router, Node-runtime, JavaScript og global CSS beholdes.
Kartavhengigheter er `leaflet`, `@turf/turf` og `proj4`; eksisterende
`fast-xml-parser` brukes for GML. Leaflet lastes bare i
nettleseren gjennom `next/dynamic` med `ssr: false`. Ingen nytt stylingrammeverk
er innført. Playwright tester kartet i et isolert nettlesermiljø.

| Lag | Ansvar |
| --- | --- |
| `components/MapExplorer/` | Kart, polygontegning, tabeller og medlemsdetaljer |
| `lib/map/browser-client.js` | Kall til egne beskyttede API-ruter |
| `lib/map/hamlets.js`, `hamlet-service.js` | Validering, datamodell og varig lagring av grendepolygoner |
| `lib/map/hamlet-member-sync.js`, `hamlet-sync-background.js` | Samlet, versjonskontrollert rematch og sikker oppstart av bakgrunnsjobb |
| `netlify/functions/hamlet-member-sync-background.mjs` | Langvarig grende-/tomtekobling uten å holde kartforespørselen åpen |
| `lib/map/kartverket-address-service.js` | Kartverkets adresseadapter, paginering og normalisering |
| `lib/map/kartverket-property-service.js` | Matrikkelreferanser og adresseplasseringer; ikke eiendomsgrenser |
| `lib/map/kartverket-boundary-service.js` | Åpent WFS/GML-uttrekk, UTM-transformasjon og teiggeometri |
| `lib/map/osm-road-service.js` | Utskiftbar veiadapter og klipping av geometri |
| `lib/map/geo.js`, `normalization.js` | GeoJSON, Turf-operasjoner og normalisering |
| `lib/map/register-service.js` | Minimale, serverbaserte registeroppslag |
| `lib/map/comparison.js` | Ren, testbar sammenligning uten I/O eller registerendringer |
| `lib/map/selection.js`, `member-hamlet-assignment.js` | Entydig kart-/registerkobling og trygg grendetildeling ved opprettelse |
| `lib/map/service.js`, `cache.js`, `http.js`, `api.js` | Orkestrering, offentlig datacache, tidsgrenser og tilgang |

`POST /api/admin/map/search` tar `{ polygon, datatype, includeBoundaries?, hamletId? }`, der `datatype` er
`addresses`, `roads`, `properties` eller `comparison`. `polygon` er en GeoJSON Polygon eller
Feature med Polygon-geometri. `hamletId` kan bare brukes ved `comparison` og
avgrenser registerdelen til lagrede koblinger. Klienten får ikke velge eksterne URL-er.

`GET /api/admin/map/hamlets` returnerer aktive grender, også dem uten polygon.
`POST /api/admin/map/hamlets` tar `action: create | save | clear`. Oppretting og
lagring krever `name`, `polygon` og valgfri boolsk `reviewed`; endring/fjerning
krever `id` og siste `version`. Lagrede GeoJSON-egenskaper normaliseres på server.
Ruten har samme autentisering, CSRF-, størrelses- og rate-limit-vern som øvrig
kart-API. Responsene er private og ikke cachebare. Et kontrollert resultat
returnerer også `rematch.status` (`queued`, `started` eller `failed`).
Demonstrasjonsmodus tillater ikke varig lagring. Valg av en grend henter data og registerkoblinger for denne
ved behov; løsningen
forhåndshenter ikke alle grender og lagrer ikke kopier av Kartverket-data i Neon.
Bare koblingen i `members.hamlet_id` lagres. Hver automatisk kjøring skriver
endrede medlemsposter gjennom eksisterende audittrigger og et aggregert
sammendrag til brukerloggen uten adresser, koordinater eller medlems-ID-liste.

Alle kartrutene og siden krever eksisterende `members`-rettighet. Med konfigurert
Entra-rollemodell betyr dette `TFV.MemberAdmin`; `TFV.ReadOnly` eller bare
`TFV.MatrikkelAdmin` er ikke nok. Den eksisterende allowlist-modellen uten
rollekrav beholdes. Ingen ny Entra-rolle eller databasemigrering behøves.
Produksjon krever en egen server-side `HAMLET_JOB_SECRET` i Netlify Functions-
konteksten; den må ikke ha `NEXT_PUBLIC_`-prefiks.

### Offentlig kart på forsiden

Forsiden viser bare grender med lagret og manuelt kontrollert polygon. Ingen
grend er valgt ved innlasting. Én knapp per grend velger og zoomer området;
samme knapp slår valget av igjen. **Vis eiendommer** gjør et behovsstyrt kall
til `GET /api/map/hamlets/[id]/properties`; alle grender og Kartverket-adresser
forhåndshentes derfor ikke ved vanlig sidevisning.

`lib/map/public-map-service.js` bruker den lagrede `members.hamlet_id`-koblingen
som autoritativ avgrensning og leser bare `h_number`, `cadastral_number` og
`street_address` for aktive poster i valgt grend. Kartverket-oppslaget brukes
deretter bare til å plassere de valgte registerpostene i kartet. Flere tvetydige
adressetreff gir ingen gjettet markør; posten står fortsatt i listen. Responsen
inneholder ikke medlems-ID, navn, hjemmelshaver, e-post, telefon, reservasjoner
eller interne notater. Kartverket mottar polygonet server-side, ikke registerdata.

Eksisterende register ble opprinnelig fylt med `npm run hamlets:assign`. Kommandoen er nå et
manuelt kontroll-/vedlikeholdsverktøy. Den er
tørrkjøring som standard og beregner alle kontrollerte polygoner samlet, slik at
overlapp oppdages før lagring. Produksjonslagring krever eksplisitt
`APP_ENVIRONMENT=production`, `HAMLET_ASSIGNMENT_CONFIRMED=true` og `--apply`.
Normal drift starter automatisk full rematch etter lagring av et kontrollert
polygon. Nye tomter får samme sikre kobling ved opprettelse eller godkjenning.
Filtre, gruppetelling, detaljer og offentlig grendevisning leser deretter den
lagrede fremmednøkkelen; de gjør ikke egne geografiske grendeoppslag.

Engangskjøringen ble utført og kontrollert i produksjon 16.09.2026. Den koblet
424 av 428 aktive tomter til 11 kontrollerte grender, uten overlapp eller
konflikt med eksisterende koblinger. Fire tomter manglet et entydig sikkert
treff og ble med hensikt stående ukoblet for manuell kontroll.

Ruten er eksplisitt offentlig i proxy-allowlisten, avviser cross-site
nettleserkall, har 25 sekunders frist, 20 oppslag per klient/minutt som lokal
bakstopper og et offentlig femminutters CDN-cachevindu. En delt Netlify/WAF-
grense må fortsatt settes i produksjon. Bakgrunnskart og synlig attribusjon er
de samme som i adminmodulen.

## Verifiserte datakilder

Dokumentasjon, parameterformat og små anonyme HTTP-kall kontrollert 15.09.2026.

### Kartverket: adresser og matrikkelreferanser

- [Offisiell brukerveiledning](https://www.kartverket.no/api-og-data/eiendomsdata/brukarrettleiing-adresse-api)
- [Swagger](https://ws.geonorge.no/adresser/v1/) og
  [faktisk OpenAPI-spesifikasjon](https://ws.geonorge.no/adresser/v1/openapi.json)
- [Kartverkets vilkår for åpne data](https://www.kartverket.no/api-og-data/vilkar-for-bruk)

Brukt endepunkt: `GET https://ws.geonorge.no/adresser/v1/punktsok`.
Parametere: `lat`, `lon`, `radius` i hele meter, `koordsys=4326`,
`utkoordsys=4326`, `treffPerSide=1000`, `side` fra 0, `asciiKompatibel=false`.
Spesifikasjonen har `/sok` og `/punktsok`, ikke et vilkårlig polygonendepunkt.

Polygonets beregnede bbox omsluttes av en sirkel, med radius til fjerneste
bbox-hjørne pluss en liten avrundingsmargin. Alle sider hentes sekvensielt,
deretter filtreres punktene med Turf `booleanPointInPolygon`. Grensepunkter
inkluderes. Maksimalt 10 000 treff i sirkelen; overskridelse, gjentatte
resultater, endret total, uventet CRS eller manglende sider gir eksplisitt feil.
Manglende koordinater gir advarsel og sperrer sammenligning, slik at
ufullstendige data ikke gir en tilsynelatende komplett avviksrapport.

Svar kontrolleres for `EPSG:4326`; GeoJSON bruker `[lengdegrad, breddegrad]`.
Kartverket kan ellers levere 4258 som standard, derfor angis CRS eksplisitt.
Ukjente feltverdier beholdes som `null`. `snr` er alltid `null` fra denne
adapteren: dokumentasjonen sier at adressekoblingen ikke går til seksjon.
`bruksenhetsnummer` er ikke seksjonsnummer og omtolkes ikke til dette.
Adressepunkt er heller ikke matrikkelenhetens sentrum.

Ingen autentisering kreves. Faktisk svar hadde `Access-Control-Allow-Origin: *`.
En numerisk forespørselskvote er ikke angitt i den kontrollerte
adresseveiledningen/OpenAPI-en; ingen slik kvote er antatt. CC BY 4.0 og
synlig © Kartverket-attribusjon følger de publiserte vilkårene.

Den nye adapteren ble prøvd på et lite utsnitt ved Istjernvegen: 21 adresser,
inkludert `Istjernvegen 54`, `10/524`. Dette er en integrasjonskontroll, ikke
en fasit på antall adresser i hele Turufjell.

### Bakgrunnskart

[Kartverkets cache-dokumentasjon](https://cache.kartverket.no/) viser Leaflet-
eksemplet som brukes: `https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png`.
Bildene er Web Mercator (EPSG:3857); Leaflet projiserer GeoJSON-koordinatene.
En faktisk flis svarte 200 uten nøkkel, CORS `*` og fem dagers HTTP-cache.
Ingen fliser forhåndslastes eller eksporteres. CSP tillater bare den konkrete
kartvertens bilder i tillegg til eksisterende bildekilder. Global
`Referrer-Policy: no-referrer` er uendret. Kartverket ser vanlige flisforespørsler
fra nettleseren, ikke registerfelt.

### OpenStreetMap / Overpass: supplerende veier og stier

- [Overpass bbox og geometri](https://dev.overpass-api.de/overpass-doc/en/full_data/bbox.html)
- [Ressursdeling, kvoter og feilstatus](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [OSM-lisens og attribusjon](https://www.openstreetmap.org/copyright)

Brukt endepunkt: `POST https://overpass-api.de/api/interpreter`, med URL-kodet
`data`-parameter. Spørringen bruker `[out:json][timeout:15][maxsize:16777216]`,
`way["highway"](sør,vest,nord,øst)` og `out tags geom`. Ingen autentisering.
HTTP-svaret bekreftet CORS `*`; kallet kjøres likevel fra Node. Adapterens
anonyme kontroll returnerte 9 veigrupper med til sammen omtrent 667 m klippet
geometri i samme lille utsnitt. Et tidligere kontrollkall ga 504; offentlig
Overpass er en delt tjeneste uten garantert tilgjengelighet.

Geometri er geografisk lengde-/breddegrad. Hver linje deles ved kryssing av
polygonkanten. Bare delene innenfor beholdes og lengdeberegnes med Turf;
konkave polygoner, kryssende linjer og linjer på kanten er testet. Segmenter
samles bare når navn, veitype, referanse, dekke og tilgang stemmer. Uten navn
beholdes de separat. OSM-ID-er og datakilde beholdes i den normaliserte modellen.

Overpass velger veier etter noder i bbox. En liten margin fanger flere
kantkryssende veier, men kan ikke garantere full dekning for svært lange
segmenter uten noder i nærheten. OSM-data er derfor tydelig et supplement,
ikke en autoritativ/fullstendig veifortegnelse. Overpass' generelle anbefaling
om høyst omtrent 10 000 kall og 1 GB per dag er ingen app-spesifikk garanti.
Ved større bruk må egen tjeneste eller annen driftsavtale vurderes.

NVDB er vurdert gjennom [Vegnett API v4](https://nvdb.atlas.vegvesen.no/docs/produkter/nvdbapil/v4/Vegnett/)
og [NVDB API Les oversikt](https://nvdb-docs.atlas.vegvesen.no/nvdbapil/v3/introduksjon/Oversikt/).
NVDB har eget veglenke-/referansesystem og annen geometri-/pagineringstilpasning.
MVP bruker tillatt Overpass-alternativ; `findRoadsInPolygon` kan byttes uten
endringer i visningskomponentene.

### Eiendomsgrenser: implementert og kontrollert mot åpen WFS

[Offisiell metadataoppføring](https://kartkatalog.geonorge.no/Metadata/uuid/339d49c3-06a5-4310-9605-fced1fe465cb)
peker på [WFS GetCapabilities](https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig?Service=WFS&Request=GetCapabilities).
Det faktiske capabilities-dokumentet svarte uten autentisering og annonserte
bl.a. `app:Teig` og `app:Eiendomsgrense`, GML 3.2, EPSG:25833/25832/25835 og
`ImplementsResultPaging=FALSE`. GeoJSON/4326 er ikke annonsert. Derfor er det
ikke brukt en konstruert GeoJSON/WFS-URL eller naiv sideinndeling.

Adapteren bruker samme HTTPS-endepunkt med `service=WFS`, `version=2.0.0`,
`request=GetFeature`, `typeNames=app:Teig`, `srsName=urn:ogc:def:crs:EPSG::25832`,
`bbox=minØ,minN,maxØ,maxN,urn:ogc:def:crs:EPSG::25832` og `count=2001`.
BBox-kantene fortettes før projeksjon, med 2 m utvidelse. `proj4` bruker UTM32,
GRS80 og øst/nord; GeoJSON blir lengde/bredde. Dette er kartvisning/analyse,
ikke en landmålings- eller centimeternøyaktig datumtransformasjon.

`DescribeFeatureType` bekreftet 20211101-skjemaet og matrikkelfeltene.
`Polygon`, hull, `MultiSurface` og `Surface/PolygonPatch` støttes. Ukjente
geometriformater, feil CRS/dimensjon, dupliserte ID-er, eksterne XML-entiteter
og lenkereferanser avvises; ingen geometri eller matrikkelreferanser gjettes.
Alle strukturerte matrikkelreferanser beholdes. Komprimert `matrikkelnummerTekst`
tolkes ikke som fullstendig identifikasjon. Eiernavn og andre uvedkommende felt
projiseres ikke inn i datamodellen.

Et faktisk 150 m-utsnitt ga 12 GML-objekter mens resultatmetadata feilaktig sa
`numberReturned=0` og `numberMatched=unknown`. Separate `resultType=hits` ga 12.
Adapteren teller derfor før og etter uthenting, sammenligner med antall unike
objekter, og avviser ukjent/endrede antall eller mer enn 2000 treff. Den bruker
ikke WFS-paginering. Grensejobben har 22 sekunders totalfrist, høyst ett nytt
forsøk ved nettverks-/serverfeil, 8 MB svargrense og 150 000 koordinatpunkter.
Alle objekter eksaktfiltreres med Turf `booleanIntersects`, og teigens fulle
geometri beholdes. Uttrekk uten adresse er derfor også med. Tellingene er ikke
et transaksjonelt snapshot av Kartverkets database; kildeendringer med samme
antall objekter kan ikke oppdages sikkert. Hentetid følger resultatet.

Den ferdige adapteren ga 11 teiger i et annet lite Turufjell-polygon. Dette er
en kontroll av adapteren, ikke en opptelling av alle eiendommer i Turufjell.
Tjenesten svarte uten autentisering, med CORS `*`. Ingen tallfestet kvote er
publisert i den kontrollerte beskrivelsen; intern rategrense/cache gjelder.
[Kartverkets katalogoppføring hos data.norge.no](https://data.norge.no/nb/data-services/82e8b72d-3ad8-3f36-8c3b-5904c777bf7f/matrikkelen-eiendomskart-teig-wfs)
oppgir CC BY 4.0. © Kartverket / Geonorge vises i UI.

Nøyaktighetsklasse, tvist og flere matrikkelenheter vises. Teiggrenser kan
inneholde hjelpelinjer; de er ikke grunnlag for grensepåvisning. Matrikkelenheter
uten registrert kartgeometri og rettigheter uten egen teig kan ikke finnes med
dette uttrekket. Beskyttet Matrikkel SOAP og eiersøk brukes ikke av kartmodulen.

## Sammenligning og personvern

Hele det aktive interne registeret sammenlignes med adresseutvalget i polygonet.
Registeret mangler egne geografiske koordinater; en ukoblet post kan derfor
ikke sikkert plasseres innenfor polygonet. Nøkkeltall skiller mellom
offisielle adresser i polygonet og aktive poster i **hele registeret**.
Ukoblede poster med ukjent plassering ligger nå i `unlocatedRows`, vises
separat og inngår **ikke** i mangeltall. Kjente punkter utenfor utelates.
`MISSING_IN_MAP_DATA` krever et kjent punkt innenfor eller en matrikkelreferanse
i en hentet teig som berører polygonet. Sistnevnte er merket `parcel_intersects`:
det beviser ikke adresseplassering, og teigen kan være uten adresse.
Ukjent plassering er uttrykkelig ikke klassifisert som manglende kartdata.
Henting av nye grenser nullstiller
sammenligningen, slik at administrator må beregne den på nytt.

Gnr/bnr indekseres først, med eksakt normalisert adresse som supplement og
disambiguering. Motstridende kjent eiendomsidentitet/adresse er `CONFLICT`.
Ukjent seksjon/feste og flere kandidater er `POSSIBLE_MATCH`. Kandidater
beholdes; dupliserte registerkoblinger blir ikke to sikre treff. Eiere brukes
aldri som matchnøkkel. Ingen fuzzy matching eller automatisk overskriving.
Manglende gnr/bnr eller adresse vises som datakvalitetsmerknader selv ved
adressebasert samsvar. Registerlaget viser kun sikre koblinger ved den
offisielle adressens koordinater, ikke uavhengig innmålte medlemspunkter.

Serveroppslag velger eksplisitte kolonner og utelater slettede poster, tokens
og intern historikk. Normal sammenligning inneholder H-nummer,
registeradresse/-referanse og navn fra registeret. Valg av et entydig kartobjekt
henter full medlemsdetalj gjennom den eksisterende beskyttede medlemsruten.

JSON-body begrenses til 32 kB. Feilautoriserte og cross-origin-forespørsler
avvises før behandling. Alle svar er `Cache-Control: no-store, private`.
Offentlige kartresultater caches separat i fem minutter, maksimalt åtte
utvalg og to samtidige innhentinger per Node-instans. Nøkkelen bruker eksakt
polygongeometri, datatype og adapterversjon; det unngår kantfeil ved avrunding.
Registerdata og sammenligning cachelagres ikke. Samtidige identiske
søk deler offentlig innhenting. En avbrutt delt forespørsel kan måtte prøves
igjen av en annen klient; feil cachelagres ikke.

Adresse-/veikall har 18 sekunders tidsgrense per forsøk og 25 sekunders samlet
forespørselsfrist. Ett nytt forsøk tillates ved nettverksfeil/5xx; 429 gir
beskjed om å vente uten automatisk retry. Maksimal ekstern JSON-body er 5 MB,
og veidata begrenses til 30 000 koordinater. Frontenden har avbryt-knapp og
forkaster svar for et slettet/endret polygon. Eksisterende per-instans
rate-limit (20/minutt per klient) brukes som bakstopper, ikke som global
Netlify-/WAF-kvote. Ingen delt rate-limit-infrastruktur er etablert her.

Kartmodulens tidligere CSV-/GeoJSON- og kopieringsfunksjoner ble fjernet
16. september 2026 etter produktbeslutning. Medlems- og resultatseksport i de
øvrige administrasjonsmodulene er ikke berørt.

## Tester og gjenstående kontroll

Verifisert lokalt 16. september 2026 med `npm run check`, målrettede
nettlesertester på desktop og mobil og integrasjonstester mot isolert Postgres.
Testdatabasen med syntetiske data er fjernet etter kjøring.

`tests/map-*.test.mjs` dekker geometri, normalisering, alle fem statuser,
flertydighet, datakvalitetsmerknader, kart-/registervalg, automatisk grendekobling,
adaptere, paginering, ufullstendige svar, feil, retry, cache, autorisasjon, CSRF,
størrelsesgrenser og dataminimering. Eksterne tjenester og database er mocket.
Eksisterende testoppsett og `npm run check` brukes uendret.

`tests/map-hamlets.test.mjs` dekker grendedata, tilgangskontroll, validering,
konflikter og atomisk loggføring med simulert database.
`tests/hamlet-member-sync.test.mjs` dekker full rematch, sikre opprettelser,
flytting/fjerning, tvetydige/uavklarte treff, ufullstendige Kartverket-data og
utdaterte polygonversjoner. `tests/hamlet-background.test.mjs` dekker direkte
`202`, HTTPS, hemmelighetskontroll, inputvalidering og synlig oppstartsfeil.
`tests/integration/map-hamlets.test.mjs` bruker isolert Postgres med syntetiske
data og dekker gjentatt migrering, lagring/gjenlesing, samtidige endringer,
navneendring/sletting fra gruppeadministrasjonen, bevarte medlemstilknytninger
og tilbakeføring når brukerloggen feiler. Produksjonsdatabasen brukes ikke.

Varige tester ligger i `tests/e2e/application.spec.js` for desktop og mobil.
Kartdelen dekker tegning, redigering/sletting, teiglag og detaljer, kansellering,
sene svar og medlemskobling. Grendetesten dekker lagring/gjenåpning, lagvalg,
automatisk innlasting fra nedtrekkslisten, responsiv kartplassering, redigering,
utkaststatus, konflikt uten tap av data og fjerning av geometri.
WFS-testene dekker UTM-kontrollpunkter, hull,
flere flater/referanser, ukjent CRS, XML-entiteter, avkorting og endret antall.
Grenseadapteren er i tillegg kontrollert manuelt mot et lite åpent uttrekk.
Den samlede kvalitetspakken og avgrensningene er beskrevet i `quality-review.md`.

Se produksjonssjekklisten i README for reell Entra-innlogging og kontrollert
verifisering etter publisering. Ingen slik produksjonskontroll er utført under
utviklingen. Større driftskapasitet og
en eventuell offisiell veiadapter krever videre avklaring. Behold Overpass for
dagens små administratoruttrekk; ikke opprett ny infrastruktur uten godkjenning.

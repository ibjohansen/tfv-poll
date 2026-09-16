# Kart og registerkontroll

Implementert lokalt 15. september 2026. Inngang: `/admin/map`.
Ingen automatisk registerretting, import, migrering, produksjonsdeploy eller
ekstern konfigurasjonsendring utføres av kartfunksjonen. Fra 16. september kan
administrator eksplisitt lagre navn og polygon i eksisterende grender.
Denne utvidelsen krever en ny, separat godkjent migrering før publisering.

## Bruk

1. Åpne **Kart og registerkontroll** fra administrasjonsmenyen.
2. Velg **Tegn polygon**, klikk/trykk inn hjørner og velg **Fullfør polygon**.
   Kartet starter ved Turufjell, nær Istjernvegen, i Flå kommune.
3. Hent adresser, eiendomsgrenser, veier/stier og registersammenligning hver for seg. En feil
   i Overpass skal ikke hindre adressesøket.
4. Filtrer/sorter tabellene. Klikk en adresse, referanse eller vei for å zoome
   og vise detaljer. Slå kartlag av/på med avkrysningsboksene.
5. Rediger ved å dra hjørner eller endre koordinatlisten. Listen støtter også
   innsetting/fjerning av hjørner. Piltastene flytter kartet, og knappen for
   kartsenter legger til et punkt uten mus. Fullfør og hent data på nytt.
6. Eksporter eller kopier adresser/veinavn. Eksport gjelder hele søket,
   ikke tabellfilteret. En utløpt kartcache gir et nytt grunnlag ved eksport.

Bare ett enkelt polygon uten hull støttes. Arealet må være 1 m²–25 km²,
maksimalt 200 hjørner og 5 km omsluttende søkeradius. Alle hjørner må ligge
innenfor 20 km av startpunktet. Disse er **applikasjonsgrenser**, ikke en
definisjon av Turufjells område eller leverandørenes API-kvoter.
Et ulagret søkepolygon finnes bare i sidens minne og eventuell GeoJSON-eksport.
Administrator kan nå lagre polygonet som en navngitt grend i databasen.

### Grender og lagrede polygoner

1. Velg **Ny grend**, tegn området og fullfør polygonet. Oppgi grendenavnet.
   Ved inntegning fra referansebildet brukes bare områder med røde grenser;
   områder uten avgrensning opprettes ikke automatisk.
2. Velg **Lagre polygon som ny grend**. Grenden kommer i samme liste som under
   medlemsadministrasjonens **Grender og e-postgrupper**, ikke i et eget register.
3. For en eksisterende grend: velg den i **Lagret grend** og trykk **Bruk grend
   i kartet**. Grender uten polygon kan også velges og deretter få et inntegnet
   område. En grend med polygon blir gjeldende søkeområde og zoomes inn.
4. Rediger hjørnene, fullfør og velg **Lagre grendeendringer**. Navnet kan også
   endres. Ulagrede endringer krever bekreftelse før bytte til en annen grend.
5. **Fjern lagret polygon** fjerner bare geometrien, ikke grenden eller
   medlemskoblingene. **Slett polygon** i tegneverktøyet fjerner bare det lokale
   søkeområdet. Sletting av selve grenden gjøres fortsatt i gruppeadministrasjonen.

**Grendegrenser** viser alle lagrede polygoner samtidig. Bare ett polygon brukes
til søk om gangen. Utkast vises stiplet og merkes «må kontrolleres».
Administrator kan bekrefte manuell kontroll av plasseringen; geometriendringer
i editoren opphever denne bekreftelsen. Dette gjør ikke grensen til en offisiell
matrikkelgrense. Lagrede polygoner er interne Turufjell vel-data, ikke Kartverket-data.
Grendepolygoner tilordner eller flytter aldri medlemmer automatisk.

Navn, GeoJSON-geometri, kontrollstatus, versjon og endringstid lagres i
`member_hamlets`. Den lagrede grendelisten leses fra databasen, ikke en hardkodet
liste i UI. Ingen grender opprettes automatisk. Det finnes nå en separat,
valgfri katalog med omtrentlige bildeutkast, etter brukerens godkjenning.

Samtidige endringer gir `409`, og editoren beholder utkastet. **Last grendelisten
på nytt** oppdaterer listen uten å overskrive utkast eller bytte dets versjon.
Bruk en fersk grend eksplisitt før ny redigering etter konflikt. Navneendring
eller sletting fra gruppeadministrasjonen gjør også en eldre editor utdatert.
Identiske navn avvises uten å opprette duplikater. Lagring og brukerlogg skrives
atomisk; loggen inneholder aktør, grend-ID, navn, versjon, kontrollstatus, areal
og antall hjørner, ikke koordinatlister eller medlemsdata. Ingen lokale
lagringsnøkler eller databaseforbindelser sendes til nettleseren.

### Redigerbare kartutkast fra bildet

Under **Kartutkast fra bildet** finnes 11 navngitte, rødt avgrensede områder:
Slåttelia, Slåtta Vest, Slåtta Øst, Turuhaugen, Sprenåsen, Istjern, Molteputten,
Nedre Kristnatten, Turusvingen, Veslesetra og Høgsetra. Navn er avlest fra bildet;
de er ikke ment som en offisiell navneliste. Navnløse felt og områder uten røde
grenser er utelatt, inkludert det store grønne området ved Turuhaugen.

1. Velg et område og trykk **Bruk kartutkast**. Kartet zoomer til området,
   navnet fylles inn og kontrollstatus er alltid «utkast». Dette skriver ikke til databasen.
2. Velg **Rediger polygon**, flytt hjørnene eller endre koordinatfeltene og
   trykk **Fullfør polygon**. Både grendenavn og geometri kan endres.
3. Velg **Lagre polygon som ny grend**, eventuelt **Lagre grendeendringer**
   dersom en grend med samme navn allerede finnes uten geometri. Denne beholder
   ID og medlemstilknytninger. Manuell kontroll kan bekreftes når plasseringen er sjekket.
4. Ved senere besøk velges den lagrede grenden fra **Lagret grend**.

Et eksisterende polygon blir aldri erstattet ved å laste et bildeutkast,
uansett kontrollstatus. Bruk den lagrede grenden for videre redigering.
Bytte av kartutkast krever bekreftelse hvis det finnes ulagrede endringer.
En ny kopi lastes hver gang; redigering endrer ikke referansekatalogen.

GeoJSON-katalogen er `data/map-hamlet-drafts.json`; klargjøring og kobling til
eventuell eksisterende grend ligger i `lib/map/hamlet-drafts.js`.
Katalogen er **startmateriale, ikke en database-seed eller fasit**. Den innfører
ingen nye API-ruter, miljøvariabler, avhengigheter eller migreringer utover
polygonlagringen beskrevet over. Produksjonsdata er ikke importert/endret.

Bildet er bare 342 × 277 piksler og har ingen koordinatrutenett. Røde hjørner er
avlest manuelt; skjulte kanter under tekst og streker er forenklet. Grov nordvendt
plassering bruker to **omtrentlige bildeankre**: Slåttemyrtjern og Øvre
Høgsetervegen. Koordinatene til disse er hentet fra Kartverkets åpne
[stedsnavn-API](https://www.kartverket.no/api-og-data/stedsnavndata/brukarrettleiing-stadnamn-api)
16. september 2026 (`/punkt`, radius 3000 m rundt kartets startpunkt,
`koordsys=4326`, `utkoordsys=4326`). © Kartverket, CC BY 4.0, gjelder
ankerpunktene; Kartverket er **ikke** kilde til grendegrensene.
SSR-ID, koordinater, omtrentlige bildepunkter og avtegnede hjørner er dokumentert
i katalogen. En lineær tilpasning per akse gir redigerbare startkoordinater,
ikke landmålingsnøyaktighet. Veipunktet er et representasjonspunkt og
bildeplasseringen er skjønnsmessig. Ingen meternøyaktighet er dokumentert;
alle utkast må kontrolleres mot terreng/veier før de brukes som analysegrunnlag.

## Integrasjon og dataansvar

Eksisterende Next.js App Router, Node-runtime, JavaScript og global CSS beholdes.
Kartavhengigheter er `leaflet`, `@turf/turf` og `proj4`; eksisterende
`fast-xml-parser` brukes for GML. Leaflet lastes bare i
nettleseren gjennom `next/dynamic` med `ssr: false`. Ingen nytt stylingrammeverk
er innført. Playwright tester kartet i et isolert nettlesermiljø.

| Lag | Ansvar |
| --- | --- |
| `components/MapExplorer/` | Kart, polygontegning, tabeller, detaljer, eksportknapper |
| `lib/map/browser-client.js` | Kall til egne beskyttede API-ruter |
| `lib/map/hamlets.js`, `hamlet-service.js` | Validering, datamodell og varig lagring av grendepolygoner |
| `data/map-hamlet-drafts.json`, `lib/map/hamlet-drafts.js` | Valgfrie omtrentlige bildeutkast, separat fra lagrede grender |
| `lib/map/kartverket-address-service.js` | Kartverkets adresseadapter, paginering og normalisering |
| `lib/map/kartverket-property-service.js` | Matrikkelreferanser og adresseplasseringer; ikke eiendomsgrenser |
| `lib/map/kartverket-boundary-service.js` | Åpent WFS/GML-uttrekk, UTM-transformasjon og teiggeometri |
| `lib/map/osm-road-service.js` | Utskiftbar veiadapter og klipping av geometri |
| `lib/map/geo.js`, `normalization.js` | GeoJSON, Turf-operasjoner og normalisering |
| `lib/map/register-service.js` | Minimale, serverbaserte registeroppslag |
| `lib/map/comparison.js` | Ren, testbar sammenligning uten I/O eller registerendringer |
| `lib/map/service.js`, `cache.js`, `http.js`, `api.js` | Orkestrering, offentlig datacache, tidsgrenser og tilgang |
| `lib/map/export.js` | CSV-/GeoJSON-format og vern mot regnearkformler |

`POST /api/admin/map/search` tar `{ polygon, datatype, includeBoundaries? }`, der `datatype` er
`addresses`, `roads`, `properties` eller `comparison`. `polygon` er en GeoJSON Polygon eller
Feature med Polygon-geometri. `POST /api/admin/map/export` tar
`{ polygon, format, includeRoads?, includeBoundaries? }`, med `addresses-csv`, `comparison-csv`
eller `geojson` som format. Klienten får ikke velge eksterne URL-er.

`GET /api/admin/map/hamlets` returnerer aktive grender, også dem uten polygon.
`POST /api/admin/map/hamlets` tar `action: create | save | clear`. Oppretting og
lagring krever `name`, `polygon` og valgfri boolsk `reviewed`; endring/fjerning
krever `id` og siste `version`. Lagrede GeoJSON-egenskaper normaliseres på server.
Ruten har samme autentisering, CSRF-, størrelses- og rate-limit-vern som øvrig
kart-API. Responsene er private og ikke cachebare. Demonstrasjonsmodus tillater
ikke varig lagring. Søke-/resultateksport inkluderer fortsatt bare det aktive
polygonet, ikke automatisk alle lagrede grender.

Alle kartrutene og siden krever eksisterende `members`-rettighet. Med konfigurert
Entra-rollemodell betyr dette `TFV.MemberAdmin`; `TFV.ReadOnly` eller bare
`TFV.MatrikkelAdmin` er ikke nok. Den eksisterende allowlist-modellen uten
rollekrav beholdes. Ingen ny Entra-rolle eller miljøvariabel behøves.

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
Manglende koordinater gir advarsel og sperrer sammenligning/eksport, slik at
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
beholdes de separat. OSM-ID-er og datakilde beholdes ved eksport.

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
antall objekter kan ikke oppdages sikkert. Hentetid følger resultat og eksport.

Den ferdige adapteren ga 11 teiger i et annet lite Turufjell-polygon. Dette er
en kontroll av adapteren, ikke en opptelling av alle eiendommer i Turufjell.
Tjenesten svarte uten autentisering, med CORS `*`. Ingen tallfestet kvote er
publisert i den kontrollerte beskrivelsen; intern rategrense/cache gjelder.
[Kartverkets katalogoppføring hos data.norge.no](https://data.norge.no/nb/data-services/82e8b72d-3ad8-3f36-8c3b-5904c777bf7f/matrikkelen-eiendomskart-teig-wfs)
oppgir CC BY 4.0. © Kartverket / Geonorge vises i UI og eksport.

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
CSV har egen kolonne for geografisk grunnlag; ukjent plassering er uttrykkelig
ikke klassifisert som manglende kartdata. Henting av nye grenser nullstiller
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
registeradresse/-referanse og navn fra registeret. E-post hentes bare ved
administratoreksport. Telefonskjema finnes ikke i dagens register: feltet
eksporteres tomt, og innsamling av telefonnumre er ikke innført.
Eksport inneholder aldri personlige tilgangslenker.

JSON-body begrenses til 32 kB. Feilautoriserte og cross-origin-forespørsler
avvises før behandling. Alle svar er `Cache-Control: no-store, private`.
Offentlige kartresultater caches separat i fem minutter, maksimalt åtte
utvalg og to samtidige innhentinger per Node-instans. Nøkkelen bruker eksakt
polygongeometri, datatype og adapterversjon; det unngår kantfeil ved avrunding.
Registerdata, sammenligning og eksport cachelagres ikke. Samtidige identiske
søk deler offentlig innhenting. En avbrutt delt forespørsel kan måtte prøves
igjen av en annen klient; feil cachelagres ikke.

Adresse-/veikall har 18 sekunders tidsgrense per forsøk og 25 sekunders samlet
forespørselsfrist. Ett nytt forsøk tillates ved nettverksfeil/5xx; 429 gir
beskjed om å vente uten automatisk retry. Maksimal ekstern JSON-body er 5 MB,
og veidata begrenses til 30 000 koordinater. Frontenden har avbryt-knapp og
forkaster svar for et slettet/endret polygon. Eksisterende per-instans
rate-limit (20/minutt per klient) brukes som bakstopper, ikke som global
Netlify-/WAF-kvote. Ingen delt rate-limit-infrastruktur er etablert her.

CSV har UTF-8 BOM, komma, CRLF, korrekt escaping og vern mot formelinjeksjon.
Sammenlignings-CSV merker interne felt som Turufjell vel og beholder begge
konfliktverdier. GeoJSON inneholder søkepolygon og geografiske data med kilde,
ikke registeret. Brukerloggen registrerer generert eksport, innlogget aktør,
format og antall, men ikke polygon, navn, e-post, telefon eller filinnhold.
Feil ved logging stopper eksportlevering. Dette bekrefter generering,
ikke at nettleseren fullførte nedlastingen.

## Tester og gjenstående kontroll

Verifisert lokalt 16. september 2026 etter bildeutkastene: `npm run check`
(lint, 250 enhetstester og produksjonsbygg) og 34 nettlesertester med
`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` bestod. Polygonlagringen bestod
tidligere samme dag 39 integrasjonstester mot isolert Postgres; denne
utkastutvidelsen endrer ikke databasekode eller skjema. Testdatabasen med
syntetiske data er fjernet etter kjøring.

`tests/map-*.test.mjs` dekker geometri, normalisering, alle fem statuser,
flertydighet, datakvalitetsmerknader, CSV/GeoJSON, adaptere, paginering,
ufullstendige svar, feil, retry, cache, autorisasjon, CSRF, størrelsesgrenser,
dataminimering og eksportlogging. Eksterne tjenester og database er mocket.
Eksisterende testoppsett og `npm run check` brukes uendret.

`tests/map-hamlets.test.mjs` dekker grendedata, tilgangskontroll, validering,
konflikter og atomisk loggføring med simulert database.
`tests/map-hamlet-drafts.test.mjs` dekker alle 11 avtegninger, gyldig geometri,
fravær av arealoverlapp, kilde/kontrollstatus, uavhengige redigeringskopier,
navnekobling til grend uten polygon og vern mot erstatning av lagrede grenser.
`tests/integration/map-hamlets.test.mjs` bruker isolert Postgres med syntetiske
data og dekker gjentatt migrering, lagring/gjenlesing, samtidige endringer,
navneendring/sletting fra gruppeadministrasjonen, bevarte medlemstilknytninger
og tilbakeføring når brukerloggen feiler. Produksjonsdatabasen brukes ikke.

Varige tester ligger i `tests/e2e/application.spec.js` for desktop og mobil.
Kartdelen dekker tegning, redigering/sletting, teiglag og detaljer, kansellering,
sene svar og CSV-nedlasting. Grendetesten dekker lagring/gjenåpning, lagvalg,
redigering, utkaststatus, konflikt uten tap av data og fjerning av geometri.
Bildeutkast testes også med hjørneredigering, avbrutt utkastbytte, eksplisitt
lagring/gjenåpning og kobling til eksisterende grend uten polygon på desktop/mobil.
WFS-testene dekker UTM-kontrollpunkter, hull,
flere flater/referanser, ukjent CRS, XML-entiteter, avkorting og endret antall.
Grenseadapteren er i tillegg kontrollert manuelt mot et lite åpent uttrekk.
Den samlede kvalitetspakken og avgrensningene er beskrevet i `quality-review.md`.

Se produksjonssjekklisten i README for reell Entra-innlogging og en kontrollert
registereksport etter publisering. Ingen slik produksjonskontroll eller
produksjonsdataeksport er utført under utviklingen. Større driftskapasitet og
en eventuell offisiell veiadapter krever videre avklaring. Behold Overpass for
dagens små administratoruttrekk; ikke opprett ny infrastruktur uten godkjenning.

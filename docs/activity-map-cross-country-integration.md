# Implementasjon: import av langrennsløyper til aktivitetskartet

Status 4. oktober 2026: løsningen er implementert, testet på en isolert
schema-only Neon-gren, migrert og importert i produksjon. Alle de 316 importerte
aktivitetene er kladder; ingen nye langrennsløyper er publisert på forsiden.
Se [migrerings- og importresultatet](database/database-migration-2026-10-04-cross-country.md).

Den implementerte tørrkjøringen mot de faktiske endepunktene fant 84 kildelinjer
fra Kartverket og 322 fra OpenStreetMap. Etter klipping, splitting og validering
ga dette 418 kandidater: 316 nye, fire sikre koblingsforslag og 98 avviste eller
utenfor området. Den kontrollerte førstegangsimporten valgte de 316
gjennomførbare hovedkandidatene; de fire sikre sekundærkildene ble koblet til de
samme aktivitetene. En ny produksjonsforhåndsvisning bekreftet deretter 320
uendrede kildeobjekter og null nye eller endrede kandidater.

## Mål og avgrensning

Første versjon skal hente statiske løypetraséer fra Kartverkets Turrutebase og
OpenStreetMap, normalisere dem og legge dem inn i den eksisterende
aktivitetsmodulen. Importområdet avgrenses til dagens tekniske grense: en sirkel
med radius 20 km rundt aktivitetskartets sentrum ved Turufjell skisenter:

- breddegrad: `60.472346404200735`
- lengdegrad: `9.493626688578507`
- radius: `20 km`

Integrasjonen skal ikke hente prepareringsstatus i sanntid. Sporet brukes bare
som en ordinær ekstern lenke; forslaget forutsetter ingen dataavtale med Sporet.
Løyper utenfor importområdet vises ikke som egne aktiviteter. Brukeren får i
stedet lenker til eksterne karttjenester som allerede dekker større områder.

## Anbefalt produktatferd

Opprett én ny administrerbar kategori og type gjennom den eksisterende
aktivitetskatalogen:

| Felt | Verdi |
| --- | --- |
| Kategori-ID | `cross_country` |
| Visningsnavn | Langrenn |
| Kategorifarge | `#2f6fb0` |
| Type-ID | `route` |
| Type | Løype |
| Geometriform | Linje |
| Standard sesong | Vinter |

Alle nye, eksterne aktiviteter opprettes som kladd. Administrator må kontrollere
og publisere dem. Eksisterende manuelle aktiviteter skal aldri slettes eller
overskrives automatisk.

Forsiden viser bare godkjente aktiviteter gjennom dagens publiseringsregel:
`is_draft = FALSE`, gyldig geometri og ikke slettet. Filteret «Langrenn» kommer
automatisk fra aktivitetskatalogen på samme måte som de øvrige kategoriene.

## Kilder og prioritet

### 1. Kartverket

Kartverkets Turrutebase er primærkilde. Den inneholder ruter med definert
vedlikeholdsansvar og tilbyr blant annet geometri, navn, gradering, preparering
og vedlikeholdsansvarlig.

Geonorges nedlastings-API er normal hovedinngang. Implementasjonen bestiller den
ferdig genererte GPX/WGS84-filen for Buskerud, leser ZIP og XML strømmet med
størrelsesgrenser og klipper deretter lokalt til 20-kilometerssirkelen. GPX ble
valgt fordi første leveranse trenger geometri, navn og vedlikeholdskilde, og
fordi dette unngår å gjøre importen avhengig av den ustabile WFS-tjenesten.
Aktivitetens navnefelt settes til `desc (name)` fra GPX-dataene. Dersom ett av
feltene mangler, brukes det tilgjengelige feltet alene. `src` brukes som kort
tekst og vedlikeholdsansvarlig.

Kilder:

- [Kartverkets friluftslivsdata](https://kartverket.no/api-og-data/friluftsliv)
- [Turrutebasen i Geonorge](https://kartkatalog.geonorge.no/metadata/d1422d17-6d95-4ef1-96ab-8af31744dd63)
- [Kartverkets vilkår, CC BY 4.0](https://www.kartverket.no/api-og-data/vilkar-for-bruk)

### 2. OpenStreetMap

OpenStreetMap er supplerende kilde. Hent `way`- og `relation`-objekter merket
med `piste:type=nordic`, og ruter med `route=piste` kombinert med
`piste:type=nordic`.

Relasjoner prioriteres fremfor medlemslinjene når de beskriver samme navngitte
rute. Enkeltlinjer som allerede inngår i en importert relasjon skal ikke også
opprettes som egne aktiviteter, med mindre de har egne egenskaper eller representerer
en selvstendig trasé.

For et avgrenset, manuelt eller månedlig uttrekk kan Overpass brukes med fast
serverdefinert spørring, identifiserende `User-Agent`, tidsavbrudd og størrelsesgrense.
Ved hyppigere eller større synkronisering bør et regionalt OSM-uttrekk eller
OpenSkiData vurderes for å unngå unødig belastning på den offentlige Overpass-tjenesten.

Kilder:

- [OSM-modellen for langrennsløyper](https://wiki.openstreetmap.org/wiki/Tag%3Apiste%3Atype%3Dnordic)
- [OpenStreetMaps opphavsrett og ODbL](https://www.openstreetmap.org/copyright)
- [OpenSkiData](https://www.openskidata.org/)

## Kreditering

Kreditering må være synlig så lenge importerte løypedata vises, uavhengig av
hvilket bakgrunnskart brukeren velger.

Anbefalt tekst i kartets krediteringskontroll:

> Løypedata: © Kartverket (CC BY 4.0) · © OpenStreetMap-bidragsytere (ODbL)

«Kartverket», «CC BY 4.0», «OpenStreetMap-bidragsytere» og «ODbL» skal være
klikkbare lenker til henholdsvis kilden og lisensvilkårene. Leaflets eksisterende
kreditering for Kartverkets og Esris bakgrunnskart beholdes separat.

Hver importert aktivitet skal i tillegg vise «Kilde: Kartverket», «Kilde:
OpenStreetMap» eller begge i detaljvisningen. Kildeinformasjonen bygges fra en
fast, serverdefinert leverandørkatalog; vilkårlig HTML fra eksterne data skal
aldri rendres.

## Foreslått dataflyt

```text
Kartverket GPX ─┐
                ├─> kildeadaptere ─> validering og klipping ─> normaliserte kandidater
OSM/Overpass ───┘                                      │
                                                       v
                                         kobling og duplikatkontroll
                                                       │
                                                       v
                                          kontrollplan i admin/CLI
                                                       │
                                             eksplisitt godkjenning
                                                       │
                                                       v
                                      activity_map_features som kladder
                                                       │
                                             manuell publisering
                                                       │
                                                       v
                                                 offentlig kart
```

Eksterne tjenester skal aldri kalles ved vanlig sidevisning. Offentlig kart leser
bare kontrollerte data fra egen database og dagens offentlige cache.

## Normalisering av geometri

1. Hent et rektangulært uttrekk som dekker 20-kilometerssirkelen.
2. Transformer kildedata til WGS84/GeoJSON.
3. Klipp alle linjer til den eksakte sirkelen, ikke bare rektangelet.
4. Avvis ugyldige koordinater, tomme linjer, urimelig lange segmenter og data
   utenfor den tillatte regionen.
5. Slå sammen sammenhengende segmenter som tilhører samme identifiserte rute,
   så lenge resultatet fortsatt er én `LineString`.
6. Del forgrenede eller usammenhengende kilder i selvstendige linjekandidater.
7. Forenkle linjer med mer enn 200 punkter forsiktig, med dokumentert toleranse
   og kontroll av endepunkter og linjeføring. Hvis en linje ikke kan reduseres
   forsvarlig, deles den i flere kandidater med maksimalt 200 punkter hver.
8. Behold kildegeometrien privat i importgrunnlaget slik at normalisering kan
   etterprøves og kjøres på nytt.

Dagens aktivitetsvalidering tillater bare `LineString`, maksimalt 200 punkter og
punkter innenfor 20 km fra kartets sentrum. Disse grensene beholdes. Importplanen
skal bruke den samme `normalizeActivityFeatureInput`-valideringen som manuell
lagring. Data som ikke kan tilpasses grensene uten å endre løypens meningsinnhold,
avvises og importeres ikke.

## Kildemodell og migrering

Dagens `activity_map_features` mangler stabile kildeidentifikatorer. Ikke bruk
`last_changed_by`, aktivitetsnavn eller tooltip til denne koblingen.

Foreslåtte additive tabeller:

### `activity_map_sources`

Fast leverandørkatalog med ID, visningsnavn, prioritet, krediteringstekst,
kildelenke, lisensnavn og lisenslenke. Første rader er `kartverket` og
`openstreetmap`.

### `activity_map_source_runs`

Én rad per forhåndsvisning eller anvendt kjøring:

- leverandør og tidspunkt
- kildeversjon eller uttrekkstidspunkt
- sentrum og radius
- SHA-256 av rått og normalisert grunnlag
- plan-hash
- aktør og status
- antall nye, endrede, uendrede, overlappende, avviste og manglende objekter
- feilkode uten rå leverandørfeil eller legitimasjon

### `activity_map_source_items`

Normaliserte kandidater og beslutninger:

- leverandør og stabil ekstern ID
- kildefingeravtrykk
- navn og normaliserte egenskaper
- privat kildegeometri og forenklet visningsgeometri
- koblet `activity_map_features.id`, hvis godkjent
- status: ny, matchet, endret, uendret, avvist eller mangler i kilden
- kontrollnotat, samsvarsgrunn og eventuell matchscore
- første og siste gang objektet ble sett

En unik nøkkel på `(source_id, external_id)` gjør gjentatte importer idempotente.
En aktivitet kan kobles til både Kartverket og OpenStreetMap, slik at ett
publisert kartobjekt kan ha begge kildene uten å bli duplisert.

`activity_map_features` trenger i tillegg et avgrenset felt som angir om
geometrien er manuell eller kildeforvaltet. Publiseringsstatus og manuelt
redigerte presentasjonsfelt beholdes i dagens tabell.

## Kobling og duplikatkontroll

Kjør duplikatkontroll i denne rekkefølgen:

1. Samme leverandør og samme eksterne ID er samme kildeobjekt.
2. Kartverket er foretrukket geometri når Kartverket og OSM beskriver samme rute.
3. Navnelikhet alene er aldri tilstrekkelig.
4. Et automatisk forslag til kobling krever både normalisert navne-/operatørtreff
   og høy geografisk overlapp innenfor en liten, dokumentert toleranse.
5. Usikre treff forblir separate kladder med varsel og må avgjøres manuelt.

Anbefalt første terskel for et koblingsforslag er minst 80 prosent overlapp
innenfor 25 meter, kombinert med samsvarende navn eller vedlikeholdsansvarlig.
Terskelen må prøves mot reelle data før den låses. Systemet skal vise hvorfor
et treff ble foreslått.

Hvis et tidligere importert objekt mangler i én ny kjøring, skal det ikke slettes.
Det markeres som «ikke funnet i siste kildeuttak». Arkivering foreslås først etter
to vellykkede kjøringer hvor objektet fortsatt mangler, og krever administratorens
godkjenning.

## Admin-grensesnitt

Legg et panel «Importer løypedata» i aktivitetsmodulen med:

- valg av Kartverket, OpenStreetMap eller begge
- låst visning av sentrum og radius
- tidspunkt og fingeravtrykk for kildegrunnlaget
- oppsummering av nye, endrede, matchede, avviste og manglende objekter
- kartlag der kandidater kan slås av og på per kilde og status
- listefiltre for kilde, importstatus og publiseringsstatus
- sammenligning av eksisterende og foreslått navn, metadata og geometri
- handlingene godkjenn som kladd, koble til eksisterende aktivitet, avvis og
  behold eksisterende

Kilde og kreditering er låste systemfelt. Publisering forblir en separat handling
etter at kandidaten er godkjent som aktivitet.

### Løyper utenfor kartområdet

Forsiden får en kort seksjon under kartet: «Se flere langrennsløyper». Den kan
lenke til tjenester som dekker større områder, uten at geometrien kopieres eller
videredistribueres av Turufjell Vel:

- [Sporet](https://sporet.no/) for løypekart og tilgjengelig prepareringsstatus
- [Norgeskart](https://www.norgeskart.no/) med temakartet Friluftsliv
- [OpenSnowMap](https://www.opensnowmap.org/) for OpenStreetMaps vintersportsdata

Dette er ordinære eksterne lenker som åpnes i ny fane med
`noopener noreferrer`. Forslaget omfatter ikke innbygging, skjermskraping eller
kopiering av Sporets data. Dermed beskrives bare funksjonalitet som kan leveres
uten en ny leverandøravtale.

## Synkronisering og manuelle endringer

Første leveranse bør være en eksplisitt import, ikke en automatisk jobb. Når
arbeidsflyten er kontrollert kan månedlig forhåndsvisning vurderes.

Ved senere kjøringer:

- ny ekstern ID opprettes som ny kandidat
- endret kildefingeravtrykk opprettes som endringsforslag
- uendret objekt gir ingen aktivitetsskriving
- et kildeforvaltet navn kan oppdateres etter eksplisitt godkjenning; tooltip,
  nettsted og publiseringsstatus overskrives ikke automatisk
- kildeforvaltet geometri kan erstattes først etter godkjenning
- manuelt frikoblet geometri skal aldri erstattes av en synkronisering

Alle anvendte endringer loggføres med leverandør, kjørings-ID, aktør og berørte
aktiviteter. En feil midt i en anvendelse skal rulle tilbake hele kjøringen.

## Sikkerhet og robusthet

- Kilde-URL-er og spørringer defineres server-side; nettleseren får ikke angi
  vertsnavn eller videresendingsmål.
- Bruk tidsavbrudd, maksimalt responsvolum, maksimum antall objekter og samlet
  koordinatbudsjett.
- XML/GML behandles uten eksterne entiteter eller eksterne referanser.
- Overpass-kall bruker POST, fast spørring, identifiserende `User-Agent` og
  kontrollert retry ved 429/5xx.
- Leverandørfeil lagres og vises som kode og parametre, ikke rå respons.
- Importkjøring bruker direkte databaseforbindelse, transaksjon, advisory lock,
  versjonskontroll og en kontrollert plan-hash på samme måte som den eksisterende
  aktivitetsimporten.
- Produksjonsanvendelse krever eksplisitt godkjenning og et verifisert
  gjenopprettingspunkt.

## Ytelse

Selv et 20-kilometersnett kan være vesentlig større enn dagens aktivitetsdata.
Bare et kontrollert utvalg skal publiseres i første omgang.

Anbefalt løsning:

- behold en forenklet visningsgeometri for publiserte objekter
- behold dagens kategorifilter og publiseringsregel
- sett en samlet størrelsesgrense for den offentlige aktivitetsresponsen
- cache den offentlige, upersonlige responsen med dagens aktivitetscachetag
- invalider cache bare etter godkjente endringer

Mål rå størrelse, normalisert størrelse, antall koordinater, serverresponstid og
nettleserens tegnetid før hele området publiseres.

## Foreslått leveranseplan

### Fase 1 – datagrunnlag og tørrkjøring (implementert lokalt)

1. Opprett kildeadaptere med lokale test-fixtures for Kartverket og OSM.
2. Hent et engangsuttrekk for 20-kilometersområdet uten databaseskriving.
3. Dokumenter antall, geometristørrelse, egenskapsdekning og duplikatforslag.
4. Vis et lokalt forhåndsvisningskart og en maskinlesbar plan.

### Fase 2 – database og administrasjon (implementert og produksjonsmigrert)

1. Legg til kildetabellene og støtte for kildeforvaltet linjegeometri.
2. Opprett kategorien Langrenn og typen Løype idempotent.
3. Legg til importpanelet, kildefiltre, differansevisning og kreditering.
4. Importer godkjente kandidater som kladder på en isolert Neon-gren.
5. Gjenta den kontrollerte, snapshot-beskyttede kladdeimporten i produksjon.

### Fase 3 – offentlig visning (kode implementert, ingen løyper publisert)

1. Mål nyttelast og tegnetid med det kontrollerte utvalget.
2. Vis permanent kreditering og kilde per aktivitet.
3. Vis eksterne lenker til større løypekart under aktivitetskartet.
4. Publiser et kontrollert utvalg, og kontroller mobil, tastatur og skjermleser.
5. Publiser flere løyper først etter visuell kontroll av overlapp og navn.

### Fase 4 – kontrollert oppdatering

1. Kjør en ny forhåndsvisning og bekreft idempotens/endringsdeteksjon.
2. Innfør eventuelt månedlig opprettelse av endringsforslag.
3. Behold eksplisitt godkjenning før publisert geometri endres eller arkiveres.

## Testkrav

- Kartverket- og OSM-fixtures dekker gyldige, ugyldige, store og ufullstendige svar.
- Sirkelklipping og koordinattransformasjon testes ved grensene.
- OSM-relasjoner og medlemslinjer gir ikke dobbeltimport.
- Kartverket/OSM-overlapp gir ett koblingsforslag med begge krediteringer.
- Usikre treff forblir separate kladder.
- Gjentatt identisk import er en no-op.
- Manuelle presentasjonsfelt og frikoblet geometri overlever ny synkronisering.
- Manglende kildeobjekt slettes ikke automatisk.
- Feil midt i anvendelsen ruller tilbake kandidater, koblinger og aktiviteter.
- Offentlig API returnerer aldri privat kildegrunnlag eller importdiagnostikk.
- Kreditering vises for topografisk kart, satellittkart og fullskjerm.
- Lastetest dekker alle godkjente aktiviteter innenfor 20 km på mobil og desktop.
- `npm run check`, `git diff --check` og nettlesertest kjøres før commit.

## Akseptansekriterier for første produksjonsimport

- Importplanen er gjennomgått med antall per kilde og status.
- Ingen eksisterende aktivitet er endret uten at dette står eksplisitt i planen.
- Alle nye aktiviteter er kladder.
- Alle geometrier ligger innenfor den avtalte sirkelen og har gyldig linjetype.
- Kartverket prioriteres ved bekreftet dublett, og begge kilder krediteres.
- Offentlig kart viser ingen nye løyper før separat publisering.
- Importen er idempotent og har testet gjenopprettingsprosedyre.
- Produksjonskjøring har eksplisitt godkjenning og verifisert snapshot.

## Neste beslutning

Gjennomgå kladdene visuelt i admin og velg hvilke aktiviteter som eventuelt skal
publiseres. Publisering er fortsatt en separat handling per aktivitet; denne
importen har ikke gjort noen langrennsløype offentlig.

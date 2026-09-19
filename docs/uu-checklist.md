# UU-sjekkliste for medlemsservice.turufjellvel.no

Sist gjennomgått: 19. september 2026.

Dette er en teknisk forhåndsvurdering av løsningen mot de 35 obligatoriske
suksesskriteriene i WCAG 2.0 nivå A og AA som gjelder for privat og frivillig
sektor i Norge. Den er en arbeidsliste, ikke en formell samsvarserklæring eller
juridisk vurdering.

Uu-tilsynet oppgir at privat sektor skal følge WCAG 2.0 nivå A og AA, med unntak
av 1.2.3, 1.2.4 og 1.2.5:

- [Uu-tilsynet: Hva sier forskriften?](https://www.uutilsynet.no/regelverk/kva-seier-forskrifta/153)
- [Uu-tilsynet: WCAG-standarden](https://www.uutilsynet.no/wcag-standarden/wcag-standarden/86)

## Statusforklaring

- **OK**: Kode, produksjonsstikkprøve eller eksisterende test gir rimelig støtte
  for samsvar. Dette er ikke en garanti for at alle forekomster er feilfrie.
- **Må testes**: Kan ikke avgjøres sikkert uten bredere manuell test, innlogget
  innhold, skjermleser eller en redaksjonell kontroll.
- **Sannsynlig avvik**: Det er funnet konkret kode eller produksjonsatferd som
  sannsynligvis ikke oppfyller kriteriet.
- **Ikke relevant**: Denne typen innhold eller funksjon finnes ikke nå. Statusen
  må vurderes på nytt hvis innholdet endres.

## Testgrunnlag og avgrensning

Følgende ble kontrollert i produksjon 19. september 2026:

- forsiden, `/admin/login`, `/survey` uten gyldig invitasjon og
  `/mine-opplysninger` uten gyldig medlemsøkt
- tilgjengelighetstre, tastaturrekkefølge på forsiden, karusellkontroller,
  artikkeldialog og tekstforstørrelse til 200 prosent på mobilbredde
- Lighthouse mobil: 100 på forsiden, innloggingen og undersøkelsessiden, og 96
  på medlemssiden; medlemssiden hadde ett kontrastfunn
- kildekode og eksisterende Playwright-tester for innloggede medlems-, survey-,
  kart- og administratorflyter

Følgende gjenstår før en formell konklusjon: skjermlesertest med VoiceOver og
NVDA, full tastaturtest av alle innloggede administratorruter, 200 prosent tekst
på alle sidetyper, kontrastmåling av alle tilstander og reelt innhold, samt test
med gyldig medlems- og undersøkelsesøkt. Automatiske 100-poengsscorer dekker
ikke alle WCAG-krav.

## Alle 35 krav

| Krav | Status | Vurdering og konkret oppfølging |
| --- | --- | --- |
| 1.1.1 Ikke-tekstlig innhold (A) | **Må testes** | Ikoner er i hovedsak skjult for hjelpemidler, karusellbilder har tekstalternativ, kartet har tekstlig alternativ og dagens artikkelbilder er dekorative. CMS tillater likevel tom alternativtekst også for meningsbærende bilder. Kontroller alle publiserte og fremtidige CMS-bilder redaksjonelt, og vurder krav om aktivt valg mellom dekorativt bilde og beskrivende alternativtekst. |
| 1.2.1 Bare lyd og bare video, forhåndsinnspilt (A) | **Ikke relevant** | Løsningen har ikke lydklipp eller video uten lyd. Vurder på nytt før slikt innhold publiseres. |
| 1.2.2 Teksting, forhåndsinnspilt (A) | **Ikke relevant** | Løsningen har ikke forhåndsinnspilt video med lyd. Vurder på nytt før video publiseres. |
| 1.3.1 Informasjon og relasjoner (A) | **Må testes** | Overskrifter, lister, tabeller, `label`, `fieldset` og `legend` brukes gjennomgående. Kontroller innloggede tabeller, diagrammer, egendefinerte faner og redigeringsfelter med skjermleser. |
| 1.3.2 Meningsfylt rekkefølge (A) | **Må testes** | Forsiden har logisk DOM-rekkefølge, men alle sidepaneler, dialoger, mobilmenyer og dynamiske administratorvisninger må leses sekvensielt med skjermleser. Artikkeldialogens fokusproblem er også relevant for rekkefølgen. |
| 1.3.3 Sensoriske egenskaper (A) | **OK** | Instruksjoner bruker tekst og navn, ikke bare form, farge, retning eller plassering. Kartfunksjonene har navngitte knapper og tabellalternativ. |
| 1.4.1 Bruk av farge (A) | **OK** | Status, valg og feil formidles også med tekst, symbol eller programmatisk tilstand. Diagrammer har tekst/tabell. Kontroller på nytt ved nye visualiseringer. |
| 1.4.2 Styring av lyd (A) | **Ikke relevant** | Ingen lyd starter automatisk. |
| 1.4.3 Kontrast, minimum (AA) | **Sannsynlig avvik** | Lighthouse fant 4,25:1 for `.member-profile-hero .eyebrow` på `/mine-opplysninger`; kravet for den aktuelle tekststørrelsen er 4,5:1. Endre forgrunns- eller bakgrunnsfargen og mål normal-, hover-, fokus-, deaktivert- og feiltilstand på alle sidetyper. |
| 1.4.4 Endring av tekststørrelse (AA) | **Må testes** | Forsiden var lesbar ved 200 prosent på 412 px bredde, men fikk 15 px horisontal overflyt og logoen ble sterkt komprimert. Test alle sidetyper ved 200 prosent uten tap av tekst eller funksjon, særlig tabeller, kart, dialoger og administratorpaneler. |
| 1.4.5 Bilder av tekst (AA) | **OK** | Vanlig innhold gjengis som tekst. Logoen er et tillatt, nødvendig merkevareunntak. Ikke publiser informasjonsgrafikk eller skannede tekster uten tekstlig alternativ. |
| 2.1.1 Tastatur (A) | **OK** | Produksjonsstikkprøven og Playwright-testene dekker tastaturnavigasjon i karusell, menyer, skjema, kartalternativer, tabeller og sentrale dialoger. Gjenta full test når P0-funnene nedenfor er rettet. |
| 2.1.2 Ingen tastaturfelle (A) | **OK** | Egendefinerte valg og dialoger kan forlates med Tab eller Escape. Artikkeldialogen slipper fokus feilaktig ut i bakgrunnen, men låser ikke brukeren inne; dette føres som avvik under 2.4.3. |
| 2.2.1 Justerbar hastighet (A) | **Må testes** | Det er ingen kjent kort tidsfrist mens skjema fylles ut. Kontroller varsling, forlengelse og gjenoppretting ved utløpt medlemsøkt, administratorøkt og undersøkelsesøkt. Invitasjonslenkers sikkerhetsutløp må dokumenteres som sikkerhetsmekanisme og brukeren må enkelt kunne be om ny lenke. |
| 2.2.2 Pause, stopp, skjul (A) | **OK** | Karusellen har synlig pause/spill-kontroll, stopper ved hover og tastaturfokus, stopper utenfor skjermen og respekterer redusert bevegelse. Den tidligere vurderingen om manglende pauseknapp gjelder ikke dagens produksjon. |
| 2.3.1 Terskelverdi på maksimalt tre glimt (A) | **OK** | Ingen blinkende eller raskt skiftende innhold ble funnet. Overganger deaktiveres ved redusert bevegelse. |
| 2.4.1 Hoppe over blokker (A) | **Sannsynlig avvik** | Forsiden har «Hopp til innhold», men medlems- og administratorsidene mangler en tilsvarende mekanisme før gjentatt topp- og administratornavigasjon. Legg en felles hoppelenke i layouten med stabilt mål på hovedinnholdet. |
| 2.4.2 Sidetitler (A) | **Sannsynlig avvik** | Forsiden, innloggingen, medlemssiden og CMS-artikler har titler. `/survey` og de fleste administratorrutene arver den generelle tittelen «Medlemsservice \| Turufjell Vel» og beskriver ikke den konkrete siden. Legg rutespesifikke metadata på undersøkelse, medlemmer, kart, utsendelser, web, logg og bruk. |
| 2.4.3 Fokusrekkefølge (A) | **Sannsynlig avvik** | Produksjonstesten viste at Tab fra siste lenke i artikkeldialogen går til e-postlenken bak dialogen. Dialogen gjør ikke bakgrunnen inert og returnerer ikke fokus til artikkelkortet ved lukking. Bruk samme fokusfelle og fokusretur som `ConfirmDialog`. |
| 2.4.4 Formål med lenker i kontekst (A) | **OK** | Artikkelkortets faktiske lenkenavn er artikkeltittelen; «Les saken» er visuell hjelpetekst, ikke en egen generisk lenke. Dokument-, navigasjons- og handlingslenker har forståelige navn. |
| 2.4.5 Flere måter å finne nettsider på (AA) | **Må testes** | Den lille offentlige løsningen har artikkeloversikt og direkte adresser, men ingen søk, innholdsfortegnelse eller nettstedskart. Avklar hvilke CMS-sider som inngår i sidesettet, og gi minst to reelle fremfinningsmåter der prosessunntaket ikke gjelder. |
| 2.4.6 Overskrifter og ledetekster (AA) | **OK** | Overskriftsnivåene er logiske i kontrollerte stikkprøver, og skjemaelementene har synlige, forståelige ledetekster. |
| 2.4.7 Synlig fokus (AA) | **Sannsynlig avvik** | Tastaturtesten i produksjon viste ingen egen fokusmarkering på språkvelgerens `.shared-select-trigger`, selv om elementet matchet `:focus-visible`. Lokal CSS inneholder en regel, men den må publiseres og verifiseres. Kontroller også alle interaktive kartlag, tabellrader og sidepaneler. |
| 3.1.1 Språk på siden (A) | **OK** | Rotdokumentet får `lang="nb"` eller `lang="en"` fra valgt språk. |
| 3.1.2 Språk på deler av innhold (AA) | **Sannsynlig avvik** | Leaflet eksponerer «Zoom in», «Zoom out» og engelsk bibliotekbeskrivelse på norsk side uten `lang="en"`. Lokaliser zoomkontrollenes navn og fjern eller språkkod engelsk hjelpetekst. Kontroller også redaksjonelt innhold og dokumenttitler. |
| 3.2.1 Fokus (A) | **OK** | Fokus alene utløser ikke innsending eller uventet navigasjon i de kontrollerte komponentene. |
| 3.2.2 Inndata (A) | **Må testes** | Språkvalg gir forventet navigasjon, mens automatiske administratorfiltre endrer innhold og URL. Test at endringene ikke flytter fokus, åpner nye vinduer eller gir uventet kontekstskifte, og varsle på forhånd dersom en kontroll gjør det. |
| 3.2.3 Konsekvent navigering (AA) | **OK** | Offentlig toppområde og administratornavigasjon har stabil plassering og rekkefølge innenfor sine respektive sidegrupper. |
| 3.2.4 Konsekvent identifikasjon (AA) | **OK** | Like funksjoner bruker gjennomgående samme navn, ikonbruk og visuell behandling. |
| 3.3.1 Identifikasjon av feil (A) | **Sannsynlig avvik** | Ved ufullstendig undersøkelse vises bare «Svar på alle … spørsmål». De konkrete ubesvarte spørsmålene identifiseres ikke, feltene får ikke `aria-invalid`, og fokus flyttes ikke til første feil. Merk og beskriv hvert ubesvart spørsmål, knytt feilen med `aria-describedby` og flytt fokus kontrollert. |
| 3.3.2 Ledetekster eller instruksjoner (A) | **OK** | Skjema har synlige ledetekster og forklaringer for format, personvern og obligatoriske opplysninger. |
| 3.3.3 Forslag ved feil (AA) | **Må testes** | Flere feiltekster forklarer neste steg, men servervalidering og formatfeil må testes i medlemsregistrering, e-postendring, eierskifte, undersøkelse og administratorredigering. Gi konkret rettingsforslag når årsaken er kjent og det ikke svekker sikkerhet eller personvern. |
| 3.3.4 Forhindring av feil ved juridiske, økonomiske eller datamessige handlinger (AA) | **OK** | Undersøkelsessvar og medlemsdata kan gjennomgås og korrigeres i samme skjema før innsending; eierskifte må godkjennes administrativt; destruktive administratorhandlinger bruker bekreftelsesdialog. Behold dette ved nye irreversible handlinger. |
| 4.1.1 Parsing (A) | **OK** | React/Next produserer strukturert HTML, og Lighthouse fant ingen relevante DOM-/ARIA-feil på stikkprøvesidene. Kjør validering på innloggede sider ved større strukturendringer. |
| 4.1.2 Navn, rolle, verdi (A) | **Må testes** | De fleste egendefinerte kontroller eksponerer navn, rolle og tilstand. Test faner, egendefinert Select, kart, rikteksteditor, dialoger og statusmeldinger med VoiceOver og NVDA; dokumenter resultatet og rett eventuelle manglende relasjoner. |

## Prioritert utviklingsliste

### P0 – sannsynlige avvik

- [ ] Rett kontrasten for `.member-profile-hero .eyebrow` til minst 4,5:1 og
  mål alle relevante tilstander.
- [ ] Gjør artikkeldialogen til en komplett modal: inert/ikke-fokuserbar
  bakgrunn, sirkulær fokusrekkefølge, Escape-lukking og fokusretur til utløser.
- [ ] Legg en felles «Hopp til innhold»-lenke på medlems- og administratorsider.
- [ ] Legg inn beskrivende sidetitler for `/survey` og alle administratorruter.
- [ ] Publiser og verifiser synlig fokus på den egendefinerte språkvelgeren.
- [ ] Lokaliser Leaflets «Zoom in»/«Zoom out» og annen engelsk hjelpetekst.
- [ ] Identifiser ubesvarte surveyspørsmål programmatisk og flytt fokus til den
  første feilen etter mislykket innsending.

### P1 – manuell samsvarstest

- [ ] Test alle representative sider med bare tastatur, inkludert innlogget
  medlem, aktiv undersøkelse og hver administrator-modul.
- [ ] Test med VoiceOver/Safari og NVDA/Firefox eller NVDA/Chrome.
- [ ] Test 200 prosent tekstforstørrelse på mobil og desktop uten tap av innhold
  eller funksjon.
- [ ] Mål kontrast for normal, hover, fokus, feil, deaktivert og valgt tilstand.
- [ ] Kontroller alle publiserte CMS-bilder og etabler redaksjonell alt-tekstregel.
- [ ] Test utløpte økter og lenker, alle valideringsfeil og feilgjenoppretting.
- [ ] Avklar og dokumenter flere fremfinningsmåter for offentlige CMS-sider.
- [ ] Gjenta Lighthouse/axe som regresjonskontroll, men ikke bruk automatiske
  resultater som erstatning for manuell WCAG-test.

# Kart og registerkontroll – forbedringsprompter

## Nåværende utfordring

Samme arbeidsflate viser grendeadministrasjon, polygontegning, datainnhenting, kartlag, registerkontroll, avvikstabeller og medlemsredigering. Funksjonene er hver for seg relevante, men rekkefølgen i DOM og på skjermen følger ikke en vanlig arbeidsoppgave. Brukeren må forstå forskjellen på søkepolygon, grendepolygon, adressepunkt, eiendomsteig, registerpunkt og selve matrikkeloppdateringen før kontrollene gir mening.

Målet er to tydelige oppgaver: «Vedlikehold grender» og «Kontroller medlemsregister». Begge kan bruke samme kartmotor, men skal ikke vise alle kontroller samtidig.

## P0 – del arbeidsflaten i oppgaver

```text
Bygg om /admin/map med en tydelig oppgavevelger øverst: «Kontroller medlemsregister» og «Vedlikehold grender». Vis bare felter og handlinger som hører til valgt oppgave. Registerkontroll skal følge stegene 1) velg grend eller tegn område, 2) hent nødvendige kilder, 3) sammenlign, 4) behandle avvik. Grendevedlikehold skal følge 1) velg/opprett grend, 2) tegn eller juster grense, 3) kontroller, 4) lagre. Behold uferdig arbeid ved bytte og varsle før data forkastes. Akseptanse: en førstegangsbruker kan beskrive neste handling ut fra skjermen uten å kjenne fagmodellene; ingen destruktive handlinger flyttes inn i kontrollflyten.
```

## P0 – grupper kart, verktøy og resultat i fast layout

```text
Lag en responsiv arbeidsflate med kontrollpanel til venstre, kart som hovedflate og resultatområde under eller til høyre på bred skjerm. Plasser polygonverktøy ved kartet, kartlag i en kompakt «Lag»-meny på kartet, og søke-/sammenligningshandlinger i kontrollpanelet. Status, feil og «Avbryt» skal ligge ved handlingen som startet jobben. På mobil skal rekkefølgen være oppgave → område → kart → handling → resultat. Bruk eksisterende CSS/Tailwind-oppsett og ingen ny designsystempakke. Akseptanse: alle funksjoner finnes én gang, visuell og DOM-rekkefølge stemmer, og ingen kontroll krever horisontal scrolling på 320 px.
```

## P0 – skill kontroll fra oppdatering

```text
Gjør det visuelt og språklig tydelig at «Sammenlign register» er lesing og ikke endrer medlemsdata. Matrikkeloppdatering skal ligge som en separat oppfølging på valgt tomt/utvalg, med oppsummering av hva som kan endres og eksplisitt bekreftelse. Bruk ordene «Kontroller», «Forslag» og «Oppdater» konsekvent. Ikke bruk råstatusene MATCH, CONFLICT osv. som primærtekst; vis norske navn, forklaring og anbefalt neste handling. Akseptanse: hver avviksrad viser kilde, forskjell, sikkerhet og neste handling; kontroll kan kjøres uten risiko for skriving.
```

## P1 – innfør en eksplisitt arbeidsflyt/state machine

```text
Erstatt kombinasjonen av mange løse booleans i MapExplorer med en reducer eller liten eksplisitt tilstandsmodell: idle, selecting-area, area-ready, fetching, results-ready, reviewing og error. Modellér valgt oppgave, områdekilde, hentede datasett og aktivt objekt separat. Avbryt gamle requests ved overgang, og tillat ikke umulige kombinasjoner som redigering samtidig med sammenligning. Ikke legg til et stort state-bibliotek uten dokumentert behov. Akseptanse: overgangene har enhetstester; handlinger er deaktivert med forklaring når forutsetninger mangler; stale responses kan ikke overskrive nyere data.
```

## P1 – forenkle valg av område

```text
Gjør «Velg lagret grend» til anbefalt standard for registerkontroll. Legg «Tegn egendefinert område» bak et sekundært valg. Vis valgt område som et kompakt sammendrag med navn, areal og «Endre». Skjul koordinatlisten i en avansert, tilgjengelig details-seksjon, men behold den som tastaturalternativ til karttegning. Akseptanse: kontroll av en eksisterende grend krever høyst tre primærhandlinger før resultater; skjermleserbruker kan opprette og redigere polygon uten pekeenhet.
```

## P1 – gjør resultatene handlingsorienterte

```text
Vis først en oppsummering med «Må følges opp», «Mulige treff», «Mangler i register» og «Ingen avvik». Skjul faner for datasett som ikke er hentet, og vis datakildene i en sekundær detaljvisning. Legg til filtre for oppfølgingsbehov og en arbeidskø der behandlet/utsatt status beholdes mens siden er åpen. Når en rad velges, synkroniser markering i kart og detaljpanel uten å åpne to overlappende paneler. Akseptanse: resultatlisten kan behandles med tastatur; filter og valgt rad beholdes ved åpning/lukking av detalj; tabelloverskrifter og statustekst er forståelige uten kart.
```

## P1 – samle tomtedetaljer etter domene

```text
Bruk samme informasjonsarkitektur i kartets og medlemsregisterets tomtepanel: 1) Matrikkeldata, kart og «Oppdater matrikkeldata», 2) Kontaktinformasjon, 3) Medlemsstatus, reservasjon og tilknytninger. Vis e-postgrupper som kompakte stablede/radbrekkende valg, og legg grend sammen med øvrige tilknytninger. Del en presentasjonskomponent eller en felles seksjonskonfigurasjon der det reduserer duplisering uten å blande kart- og registerlogikk. Akseptanse: rekkefølge og begreper er like begge steder; automatisk lagring, fokusretur og mobilvisning er testet.
```

## P2 – legg inn forklaringer akkurat der de trengs

```text
Lag korte, kontekstuelle forklaringer for «grendegrense», «søkepolygon», «adressepunkt», «eiendomsteig» og «matrikkeldata». Bruk details/popover bare for utdyping og behold viktig risiko-/kildeinformasjon synlig. Knytt hjelp til feltet den forklarer; ikke samle alt i en lang introduksjon. Akseptanse: tekstene skiller interne grenser fra offisielle eiendomsgrenser og sier hvilke kilder som mottar hvilke data.
```

## P2 – brukertest og tilgjengelighetstest før utrulling

```text
Lag Playwright-scenarier for begge hovedoppgaver på desktop og mobil: velg grend og kjør kontroll; tegn tilgjengelig polygon; filtrer avvik; åpne tomt; start matrikkeloppdatering; opprett og lagre grend. Kjør full tastaturtest og axe-sjekk, og gjennomfør en kort oppgavetest med minst én person som ikke har bygget løsningen. Registrer hvor brukeren stopper eller velger feil knapp, og juster ord/rekkefølge før produksjonssetting.
```

## Samlede prompts

Her er alle implementeringspromptene samlet i anbefalt rekkefølge, klare til å kopieres og brukes enkeltvis.

### 1. P0 – del arbeidsflaten i oppgaver

```text
Bygg om /admin/map med en tydelig oppgavevelger øverst: «Kontroller medlemsregister» og «Vedlikehold grender». Vis bare felter og handlinger som hører til valgt oppgave. Registerkontroll skal følge stegene 1) velg grend eller tegn område, 2) hent nødvendige kilder, 3) sammenlign, 4) behandle avvik. Grendevedlikehold skal følge 1) velg/opprett grend, 2) tegn eller juster grense, 3) kontroller, 4) lagre. Behold uferdig arbeid ved bytte og varsle før data forkastes. Akseptanse: en førstegangsbruker kan beskrive neste handling ut fra skjermen uten å kjenne fagmodellene; ingen destruktive handlinger flyttes inn i kontrollflyten.
```

### 2. P0 – grupper kart, verktøy og resultat i fast layout

```text
Lag en responsiv arbeidsflate med kontrollpanel til venstre, kart som hovedflate og resultatområde under eller til høyre på bred skjerm. Plasser polygonverktøy ved kartet, kartlag i en kompakt «Lag»-meny på kartet, og søke-/sammenligningshandlinger i kontrollpanelet. Status, feil og «Avbryt» skal ligge ved handlingen som startet jobben. På mobil skal rekkefølgen være oppgave → område → kart → handling → resultat. Bruk eksisterende CSS/Tailwind-oppsett og ingen ny designsystempakke. Akseptanse: alle funksjoner finnes én gang, visuell og DOM-rekkefølge stemmer, og ingen kontroll krever horisontal scrolling på 320 px.
```

### 3. P0 – skill kontroll fra oppdatering

```text
Gjør det visuelt og språklig tydelig at «Sammenlign register» er lesing og ikke endrer medlemsdata. Matrikkeloppdatering skal ligge som en separat oppfølging på valgt tomt/utvalg, med oppsummering av hva som kan endres og eksplisitt bekreftelse. Bruk ordene «Kontroller», «Forslag» og «Oppdater» konsekvent. Ikke bruk råstatusene MATCH, CONFLICT osv. som primærtekst; vis norske navn, forklaring og anbefalt neste handling. Akseptanse: hver avviksrad viser kilde, forskjell, sikkerhet og neste handling; kontroll kan kjøres uten risiko for skriving.
```

### 4. P1 – innfør en eksplisitt arbeidsflyt/state machine

```text
Erstatt kombinasjonen av mange løse booleans i MapExplorer med en reducer eller liten eksplisitt tilstandsmodell: idle, selecting-area, area-ready, fetching, results-ready, reviewing og error. Modellér valgt oppgave, områdekilde, hentede datasett og aktivt objekt separat. Avbryt gamle requests ved overgang, og tillat ikke umulige kombinasjoner som redigering samtidig med sammenligning. Ikke legg til et stort state-bibliotek uten dokumentert behov. Akseptanse: overgangene har enhetstester; handlinger er deaktivert med forklaring når forutsetninger mangler; stale responses kan ikke overskrive nyere data.
```

### 5. P1 – forenkle valg av område

```text
Gjør «Velg lagret grend» til anbefalt standard for registerkontroll. Legg «Tegn egendefinert område» bak et sekundært valg. Vis valgt område som et kompakt sammendrag med navn, areal og «Endre». Skjul koordinatlisten i en avansert, tilgjengelig details-seksjon, men behold den som tastaturalternativ til karttegning. Akseptanse: kontroll av en eksisterende grend krever høyst tre primærhandlinger før resultater; skjermleserbruker kan opprette og redigere polygon uten pekeenhet.
```

### 6. P1 – gjør resultatene handlingsorienterte

```text
Vis først en oppsummering med «Må følges opp», «Mulige treff», «Mangler i register» og «Ingen avvik». Skjul faner for datasett som ikke er hentet, og vis datakildene i en sekundær detaljvisning. Legg til filtre for oppfølgingsbehov og en arbeidskø der behandlet/utsatt status beholdes mens siden er åpen. Når en rad velges, synkroniser markering i kart og detaljpanel uten å åpne to overlappende paneler. Akseptanse: resultatlisten kan behandles med tastatur; filter og valgt rad beholdes ved åpning/lukking av detalj; tabelloverskrifter og statustekst er forståelige uten kart.
```

### 7. P1 – samle tomtedetaljer etter domene

```text
Bruk samme informasjonsarkitektur i kartets og medlemsregisterets tomtepanel: 1) Matrikkeldata, kart og «Oppdater matrikkeldata», 2) Kontaktinformasjon, 3) Medlemsstatus, reservasjon og tilknytninger. Vis e-postgrupper som kompakte stablede/radbrekkende valg, og legg grend sammen med øvrige tilknytninger. Del en presentasjonskomponent eller en felles seksjonskonfigurasjon der det reduserer duplisering uten å blande kart- og registerlogikk. Akseptanse: rekkefølge og begreper er like begge steder; automatisk lagring, fokusretur og mobilvisning er testet.
```

### 8. P2 – legg inn forklaringer akkurat der de trengs

```text
Lag korte, kontekstuelle forklaringer for «grendegrense», «søkepolygon», «adressepunkt», «eiendomsteig» og «matrikkeldata». Bruk details/popover bare for utdyping og behold viktig risiko-/kildeinformasjon synlig. Knytt hjelp til feltet den forklarer; ikke samle alt i en lang introduksjon. Akseptanse: tekstene skiller interne grenser fra offisielle eiendomsgrenser og sier hvilke kilder som mottar hvilke data.
```

### 9. P2 – brukertest og tilgjengelighetstest før utrulling

```text
Lag Playwright-scenarier for begge hovedoppgaver på desktop og mobil: velg grend og kjør kontroll; tegn tilgjengelig polygon; filtrer avvik; åpne tomt; start matrikkeloppdatering; opprett og lagre grend. Kjør full tastaturtest og axe-sjekk, og gjennomfør en kort oppgavetest med minst én person som ikke har bygget løsningen. Registrer hvor brukeren stopper eller velger feil knapp, og juster ord/rekkefølge før produksjonssetting.
```

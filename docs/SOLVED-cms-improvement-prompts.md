# Web/CMS – forbedringsprompter

## Utgangspunkt og anbefalt retning

CMS-et har allerede gode byggeklosser: Tiptap/ProseMirror for strukturert riktekst, separate utkast/publisert-status, forhåndsvisning, private filer i objektlagring og servervalidering. Det bør videreutvikles som et redaksjonelt arbeidsverktøy, ikke erstattes av enda en editor eller et tungt eksternt CMS uten et dokumentert behov.

Den største svakheten er at sideoversikt, full editor, media, status og publisering ligger i én 400-linjers klientkomponent. Automatisk lagring sender hele dokumentet etter 900 ms og etterfølges ofte av full `router.refresh()`. Det gir uklar publiseringsstatus, unødige requests og vanskelig vedlikehold.

## P0 – bygg list/detail som et tydelig redaksjonelt mønster

```text
Del CmsPageDirectory i PageList, PageEditorShell og fokuserte editorseksjoner. Oversikten skal ha fritekstsøk, statusfilter, kategorifilter, sortering og tydelige radhandlinger. Editor skal være egen rute (/admin/web/[id]) eller en stabil split-view som kan bokmerkes og gjenopprettes. På mobil brukes fullskjermeditor. Behold brukerens listefilter og scroll når editoren lukkes. Akseptanse: nettleserens tilbakeknapp virker; en side kan åpnes direkte fra URL; Tiptap lastes ikke før editoren åpnes; tom/feil/lasting har egne tilstander.
```

## P0 – gjør lagring og publisering forutsigbar

```text
Skill «Lagre utkast» fra «Publiser». Erstatt hel-dokument-autolagring etter hvert tastestopp med enten eksplisitt lagring eller robust autosave med 2–3 sekunders ro, AbortController, siste-versjon-vinner og synlig «Lagret kl. …». Publisering skal validere innhold, vise en kort oppsummering og være en eksplisitt handling. Ikke kjør router.refresh() etter hver lagring; oppdater lokal/cachet data fra svaret. Akseptanse: sakte eller ombyttede responses kan ikke overskrive nyere tekst; publisert innhold endres ikke utilsiktet av et uferdig utkast; nettverkstest setter maks requests per redigeringsminutt.
```

## P0 – innfør revisjoner og optimistisk samtidighetskontroll

```text
Lag idempotent databaseskjema for cms_page_revisions med side-ID, revisjonsnummer, full innholdssnapshot, status, tidspunkt og aktør. Legg en version-kolonne på cms_pages og krev forventet versjon ved oppdatering. Ved konflikt skal editoren stoppe og tilby å laste ny versjon eller kopiere eget utkast; aldri overskriv stille. Vis revisjonshistorikk og gjenoppretting som oppretter en ny revisjon. Følg Neon branch-first-rutinen og oppdater README-produksjonsprosedyren. Akseptanse: to faner kan ikke overskrive hverandre; publisering og gjenoppretting er reviderbare; migrasjon og rollback er testet på gren.
```

## P1 – organiser editoren etter redaktørens oppgaver

```text
Grupper feltene i «Innhold», «Bilde og dokumenter», «Lenke og synlighet» og «Publisering». Vis tittel og hovedinnhold først; flytt slug, kategori, bilde-alttekst og tekniske metadata til relevante sekundærseksjoner. Lag en sticky handlingslinje med lagrestatus, forhåndsvisning og publiser/avpubliser. Bruk progressiv visning; ikke gjem valideringsfeil. Akseptanse: hver etikett har ett entydig felt; første feil fokuseres ved validering; alle handlinger kan brukes med tastatur på 320 px bredde.
```

## P1 – videreutvikle Tiptap kontrollert

```text
Behold Tiptap StarterKit som editorgrunnlag og definer en eksplisitt, versjonert dokumentskjema-policy. Legg bare til redaksjonelt nødvendige utvidelser: tilgjengelige lenker, overskriftsnivå 2–3, lister og sitat. Vurder Tiptap CharacterCount og Placeholder; ikke tillat vilkårlig HTML, tekstfarger eller layoutmarkering. Sanitér alltid på server som i dag. Legg inn tastatursnarveier med synlige navn og korrekt toolbar-semantikk. Akseptanse: gamle body_rich_text-dokumenter åpnes etter oppgraderingen; ugyldige noder avvises/saniteres; kopi/lim inn fra Word gir forutsigbart resultat.
```

## P1 – lag et faktisk mediebibliotek

```text
Bygg et gjenbrukbart mediebibliotek over eksisterende private objektlagring: søk, filtype, opplastingsdato, bruk på sider, alternativtekst og erstatning uten brutt lenke. Generer sikre server-side varianter/thumbnails og hent original bare ved behov. Behold MIME-signaturkontroll, størrelsesgrenser og private nøkler. For opplastinger med flere filer: bruk begrenset parallellitet, fremdrift per fil og retry, ikke en skjult sekvensiell løkke. Vurder dnd-kit bare dersom rekkefølging med både tastatur og pekeenhet ellers blir uforholdsmessig komplisert. Akseptanse: samme bilde kan gjenbrukes; sletting blokkeres eller forklares når filen er i bruk; alttekst kreves for meningsbærende bilder.
```

## P1 – legg inn innholdskvalitet før publisering

```text
Lag en publiseringssjekk som viser: manglende ingress, manglende/ufullstendig bilde-alttekst, hopp i overskriftsnivå, generiske lenketekster, tomme lenker, svært lang tittel og manglende dokumenttittel. Skill feil som blokkerer fra advarsler som kan overstyres med begrunnelse. Kjør de samme reglene på serveren ved publisering. Akseptanse: regelenes resultat er deterministisk og testet; en redaktør kan gå direkte til hvert funn; dekorative bilder kan markeres eksplisitt.
```

## P2 – forbedre forhåndsvisning og publiseringslivsløp

```text
Lag forhåndsvisning i mobil-, nettbrett- og desktopbredde med samme komponenter og CSS som offentlig side. Vis tydelig at dette er utkast og hvilken revisjon som vises. Innfør valgfritt planlagt publisering/avpublisering bare dersom drift kan garantere en pålitelig bakgrunnsjobb; ellers ikke vis funksjonen. Legg til arkiv/papirkurv med gjenoppretting i stedet for at sletting bare forsvinner fra listen. Akseptanse: preview kan ikke indekseres eller åpnes uten adminrettighet; tidsstyring har observabilitet og retry; arkiverte sider gir kontrollert offentlig 404.
```

## P2 – standardiser skjema og validering

```text
Vurder React Hook Form og Zod etter en konkret bundle- og kompleksitetsmåling. Hvis de innføres, bruk JavaScript, én delt schema-definisjon for klienthjelp og autoritativ servervalidering, og map feil til eksisterende oversettelser. Hvis gevinsten ikke forsvarer nye avhengigheter, trekk i stedet dagens validering og dirty-state ut i små testbare hooks. Akseptanse: samme regler gjelder opprett, autosave og publisering; feil er knyttet til felt med aria-describedby/aria-invalid; ingen database- eller objektlagringsdata stoles på fra klienten.
```

## P2 – test den redaksjonelle kjernen

```text
Legg ende-til-ende-tester for opprett utkast, rediger riktekst, last opp/erstatt bilde, legg ved dokument, forhåndsvis, publiser, avpubliser, samtidighetskonflikt, revisjonsgjenoppretting og arkivering. Test mobil og tastatur. Legg kontrakttester rundt sanitert Tiptap-JSON og filtilgang. Mål editorens første JS og antall lagringsrequests som del av ytelsesbudsjettet.
```

## Bibliotekvalg

- Behold Tiptap; det er et etablert ProseMirror-basert fundament og er allerede integrert.
- Bruk plattformens eksisterende Next.js, React, CSS/Tailwind og objektlagring.
- Vurder React Hook Form + Zod for skjematilstand/validering og dnd-kit for tilgjengelig rekkefølging først etter måling. Ikke innfør dem bare for å følge et mønster.
- Ikke legg inn en generell komponentpakke eller et nytt designsystem i strid med prosjektets eksisterende oppsett.

## Løst 19. september 2026

Forbedringsarbeidet er implementert og kontrollert uten produksjonsdeploy eller
produksjonsmigrering:

- `/admin/web` er en fokusert, filtrerbar og sorterbar oversikt, mens editoren
  har en direkte, bokmerkbar rute på `/admin/web/[id]`. Listekontekst beholdes
  ved retur, Tiptap lastes først med editoren, og tom-, laste- og feiltilstander
  er egne visninger.
- Lagring er eksplisitt og avbrytbar. Optimistisk versjonskontroll stopper
  tapte oppdateringer og gir redaktøren valg mellom serverversjon og kopi av
  lokalt utkast. En nyere kladd endrer ikke den offentlige, publiserte revisjonen.
- Hver lagring, publisering, statusendring og gjenoppretting oppretter en
  fullstendig revisjon med aktør og tidspunkt. Arkivering kan gjenopprettes, og
  revisjonsgjenoppretting lager en ny revisjon i stedet for å omskrive historikk.
- Editorens fire seksjoner, sticky handlingslinje og kvalitetsfunn fungerer med
  tastatur og ved 320 px. Server og klient bruker de samme deterministiske
  publiseringsreglene; blokkerende feil og begrunnede advarsler skilles tydelig.
- Tiptap bruker et eksplisitt versjonert og sanert skjema med overskrifter 2–3,
  lister, sitat og sikre lenker. Eldre riktekst og ren tekst beholdes.
- Mediebiblioteket har søk, type-/datofilter, brukstelling og gjenbruk med nye
  private objektkopier. Bilder får WebP-miniatyr på serveren. Inntil tre filer
  lastes opp samtidig med status og retry; private lagringsnøkler eksponeres ikke.
- Forhåndsvisning bruker samme innholdskomponent i mobil-, nettbrett- og
  desktopbredde, krever admin og kan ikke indekseres. Planlagt publisering er
  bevisst utelatt fordi det ikke finnes en garantert jobbmekanisme for den.
- React Hook Form, Zod og dnd-kit ble ikke innført: målingen og arbeidsflyten
  forsvarte ikke ekstra klientkode eller en parallell valideringsmodell.
- Ytelsesbudsjettet passerer med 619 484 byte rå klient-JavaScript og 21 requests
  for listen, samt 953 276 byte og 28 requests for editoren. Alle 54
  Playwright-scenarier passerer på desktop/mobil, inkludert CMS-flyten.
- 337 enhets-/rute-/kontrakttester og 66 isolerte Postgres-integrasjonstester
  passerer. Migrering, destruktiv rollback, full reapply og revisjonsbackfill er
  verifisert på den midlertidige schema-only-grenen
  `test-cms-improvement-20260919` (`br-curly-art-b2deu9h1`), som utløper
  21. september 2026. Produksjon og `.env.local` ble ikke endret.

# ToDo – sikkerhetsforbedringer

Opprettet 21. september 2026 etter gjennomgang av
`docs/ekstern-sikkerhetsgjennomgang-20-09-2026.md`.

Dette er arbeidslisten for funn F-01–F-19. Den eksterne rapporten er
grunnlagsmateriale; formuleringene og tiltakene nedenfor er den anbefalte
gjennomføringen etter intern vurdering. Rapporten fant ingen kritiske eller høye
sårbarheter.

## Rammer for gjennomføringen

- [ ] Gjør kode- og dokumentasjonsendringer lokalt først. Produksjonsdeploy,
  Netlify-miljøvariabler, Entra, Neon, MailerSend, GitHub-innstillinger og push
  krever eksplisitt godkjenning.
- [ ] Del arbeidet i små, gjennomgåelige endringer. Sikkerhetskritiske endringer
  skal ha regresjonstester før de kan merkes ferdige.
- [ ] Følg produksjonsprosedyren i `README.md` når miljøvariabler, bakgrunnsjobber,
  ruter eller infrastruktur endres.
- [ ] Kjør `npm run check` før hver commit. Kjør også `npm audit` når avhengigheter
  eller låsefil endres, og bekreft `git diff --check` og at ingen hemmeligheter,
  medlemsdata eller genererte eksporter er staged.
- [ ] Test databasemigreringer på en isolert Neon-gren med syntetiske data før
  produksjon. Ta godkjent gjenopprettingspunkt før produksjonsmigrering.

## Prioritet 0 – kontroller uten kodeendring

- [ ] Bekreft at `AUTH_URL` i produksjon er nøyaktig
  `https://medlemsservice.turufjellvel.no` og bare er satt i production-context.
- [ ] Bekreft at `ADMIN_REQUIRED_ROLES` er satt, at Entra-appens
  **Assignment required** er aktivert, og at administratorer får roller via
  godkjente grupper.
- [ ] Kontroller MFA/Conditional Access, blokkerte gjestebrukere, fravær av delte
  kontoer og korrekt produksjons-redirect-URI i Entra.
- [ ] Bekreft at Neon-bucketen `cms-assets` er privat, og at
  `database/security-cleanup.sql` er kjørt.
- [ ] Kontroller de faktiske produksjonsheaderne og at Netlifys rate-limit-regler
  er aktive i deployloggen.
- [ ] Kjør `npm audit --omit=dev`, hemmelighetsskann av hele Git-historikken og
  kontroller at ingen `.env*`, `.netlify`, `.neon`, medlemsdata eller databasefiler
  er versjonert.
- [ ] Kontroller SPF, DKIM og DMARC for `turufjellvel.no`, at MailerSend-tokenet har
  minst mulige rettigheter, og at webhook-hemmeligheten er satt.
- [ ] Aktiver, etter eksplisitt godkjenning, GitHub secret scanning, push
  protection, Dependabot alerts/security updates, privat sårbarhetsrapportering
  og branch protection på `main`.

## F-01 – stabil adminidentitet og obligatoriske roller (middels)

**Foreslått rettelse**

- [ ] Legg Entra `oid` og `tid` i bruker- og JWT-identiteten. Bruk `oid` som den
  stabile allowlist-identifikatoren; visningsadresse/e-post skal ikke være eneste
  identitetsbevis.
- [ ] Innfør `ADMIN_OBJECT_IDS` eller en tilsvarende dokumentert konfigurasjon.
  Behold eventuell e-postkontroll som et ekstra avvikssignal, ikke som primærnøkkel.
- [ ] La autentiseringskonfigurasjonen feile lukket i produksjon når tenant,
  objekt-ID-allowlist eller obligatoriske app-roller mangler.
- [ ] Gjør `ADMIN_REQUIRED_ROLES` obligatorisk i produksjon og behold eksplisitt
  rettighetskartlegging per rolle.
- [ ] Oppdater `.env.example`, `README.md` og produksjonssjekklisten uten å skrive
  reelle objekt-ID-er eller privilegerte adresser i offentlig dokumentasjon.
- [ ] Test riktig og feil `oid`, feil tenant, manglende rolle, ukjent rolle og
  manglende produksjonskonfigurasjon.

**Ferdig når:** riktig e-post med feil eller manglende `oid` avvises, og produksjon
kan ikke starte i en åpen/fallback adminmodus.

## F-02 – begrens skade ved stjålet administratorøkt (middels)

**Foreslått rettelse**

- [ ] Definer hvilke handlinger som krever ny autentisering: full eksport,
  masseutsending, permanent sletting og endringer med stort skadeomfang.
- [ ] Bevar `auth_time` og relevant `amr` fra Entra i sesjonen. Krev nylig
  autentisering, for eksempel maksimalt 15 minutter, og MFA for disse handlingene.
- [ ] Implementer en kontrollert step-up-flyt mot Entra. Ikke baser kontrollen på
  et tidspunkt som klienten sender inn.
- [ ] Kort ned administrasjonsøkten fra åtte timer til et dokumentert nivå,
  foreløpig anbefalt fire timer. Vurder tilbakekallbare databasesesjoner separat;
  dette er et større tiltak enn bare kortere JWT-levetid.
- [ ] Opprett sikkerhetshendelse og varsel ved store eksporter/utsendinger. Bestem
  mottakere og terskel før varsling aktiveres; ikke legg medlemsdata i varselet.
- [ ] Vurder topartsgodkjenning for full eksport etter at step-up er innført.
- [ ] Test utløpt/relevant `auth_time`, manglende MFA, normal adminhandling,
  eksport og feil i varslingsjobben.

**Ferdig når:** en eksisterende, men for gammel eller utilstrekkelig verifisert økt
ikke kan utføre høyrisikohandlinger uten ny Entra-autentisering.

## F-03 – ett sentralt vern mot cross-site-mutasjoner (middels)

**Foreslått rettelse**

- [ ] Kartlegg alle muterende ruter og eksplisitte unntak, blant annet Auth.js,
  MailerSend-webhook og hemmelighetsbeskyttede bakgrunnsfunksjoner.
- [ ] Lag én delt kontroll som sammenligner `Origin` mot den validerte
  applikasjonsoriginen og bruker `Sec-Fetch-Site` som tilleggssignal.
- [ ] Krev godkjent `Origin` eller et dokumentert server-til-server-unntak for
  adminmutasjoner. Ikke stol på `Host` eller `request.nextUrl.origin` som
  sikkerhetsanker i produksjon.
- [ ] Krev `Content-Type: application/json` i den felles JSON-leseren for ruter
  som forventer JSON, og behold eksplisitte størrelsesgrenser.
- [ ] Erstatt de lokale `sameOrigin`-variantene med den delte implementasjonen.
- [ ] Test alle adminmutasjoner med fremmed origin, `same-site`, manglende origin,
  feil innholdstype og legitime interne/serverbaserte kall.

**Ferdig når:** alle muterende ruter har samme dokumenterte policy, og cross-origin
POST/PATCH/PUT/DELETE avvises uten å bryte godkjente webhooks eller jobber.

## F-04 – aldri send jobbhemmeligheter til request-avledet origin (middels)

**Foreslått rettelse**

- [ ] Innfør `trustedApplicationOrigin()` som i produksjon bare godtar den
  eksplisitte HTTPS-produksjonsverten fra konfigurasjon.
- [ ] La alle `dispatch*`-funksjoner hente origin fra denne funksjonen. Fjern
  request-origin som parameter og produksjonsfallback.
- [ ] Bruk en egen, tilfeldig hemmelighet for hver bakgrunnsfunksjon eller hvert
  avgrensede jobbformål. Dokumenter de nye variablene og rotasjonsrekkefølgen.
- [ ] Vurder HMAC-signering med tidsstempel og kort gjenbruksperiode som et senere
  herdingstiltak. Separate hemmeligheter og låst origin gjennomføres først.
- [ ] Test feil/manglende `AUTH_URL`, feil protokoll/vert og at ingen hemmelig
  header sendes dersom valideringen feiler.

**Ferdig når:** requestdata kan ikke påvirke verten som mottar en jobbhemmelighet.

## F-05 – ikke forbruk engangstoken ved GET (middels)

**Foreslått rettelse**

- [ ] Lag en totrinnsflyt for medlemstilgang, e-postbytte og bekreftelse av
  innmelding: GET viser en side; en eksplisitt POST forbruker tokenet.
- [ ] Legg tokenet i URL-fragment eller flytt det umiddelbart ut av URL-en med
  `history.replaceState`, slik at det ikke sendes som referrer eller blir liggende
  synlig lenger enn nødvendig.
- [ ] Beskytt POST-ruten med F-03-kontrollen, JSON-validering og eksisterende
  atomiske tokeninnløsning. GET-verifiseringsruten skal ikke endre tilstand.
- [ ] Behold korte utløpstider og generiske feilmeldinger.
- [ ] Test forhåndshenting fra e-postskanner, dobbeltklikk, utløpt token,
  gjenbruk, flere faner og tastatur/skjermleser på bekreftelsessiden.

**Ferdig når:** en automatisk GET av lenken ikke bruker opp tokenet, mens første
gyldige POST fortsatt er atomisk og bare lykkes én gang.

## F-06 – minimer data i det offentlige kartet (middels)

**Foreslått rettelse**

- [ ] Avklar og dokumenter kartets offentlige formål før responsformatet endres.
- [ ] Fjern H-nummer fra offentlig API. Vurder også å fjerne gnr./bnr. og eksakt
  gateadresse til fordel for polygon, markør uten medlemsidentifikator eller
  aggregerte antall.
- [ ] Vis bare tomter som etter vedtatt produktregel skal være offentlige;
  minst skal slettede og ikke-relevante medlemsstatuser filtreres bort.
- [ ] Sørg for at opplysninger fra det offentlige kartet ikke kan brukes som en
  enkel nøkkel til å utløse innloggings-e-post.
- [ ] Bruk delt rate limit som tillegg, ikke som erstatning for dataminimering.
- [ ] Oppdater personverninformasjon og kartdokumentasjon etter den vedtatte
  offentlige datamodellen.
- [ ] Test skraping på tvers av alle grender og verifiser at API-et ikke kan
  rekonstruere medlemsregisteret.

**Ferdig når:** det offentlige kartet oppfyller formålet uten å eksponere H-nummer
eller et adresserbart medlemsregister.

## F-07 – rate limiting uten angriperstyrt utestenging (middels)

**Foreslått rettelse**

- [ ] Lag én robust klientnøkkel som normaliserer IPv6 til et dokumentert prefiks,
  normalt `/64`, og håndterer betrodde proxyheadere korrekt på Netlify.
- [ ] Fjern hard utestenging basert bare på et H-nummer eller en adresse en
  angriper kan kjenne. Behold utsendelsesgrensen og registrer mistenkelig volum.
- [ ] Erstatt prosesslokale `Map`-tellere med delt lagring der korrekthet er
  nødvendig. Dersom lokale tellere beholdes som sekundært vern, innfør TTL,
  opprydding og maksimumsstørrelse.
- [ ] Utvid vernet til alle offentlige mutasjoner, inkludert survey-svar,
  profil/eksport, kart og bruksstatistikk etter risikovurdering.
- [ ] Vurder en universelt utformet og personvernvurdert utfordring ved globalt
  angrep. Ikke innfør CAPTCHA-leverandør uten egen beslutning.
- [ ] Test roterende IPv6-adresser, mange serverinstanser, kjent H-nummer,
  proxyheadere og at legitime brukere fortsatt kommer inn under angrep.

**Ferdig når:** én angriper ikke enkelt kan låse ute et bestemt medlem eller alle
medlemmer, og rate limit fungerer på tvers av produksjonsinstanser.

## F-08 – fjern timingforskjell i innmeldingsskjemaet (lav)

**Foreslått rettelse**

- [ ] Gjør bare formatvalidering og nødvendig rate limit før det generiske
  `202`-svaret.
- [ ] Flytt eiendomskontroll, Kartverket-oppslag og e-postarbeid til `after()` eller
  eksisterende bakgrunnsjobbmønster uten å lekke intern status til klienten.
- [ ] Sørg for idempotens og synlig intern feilstatus dersom bakgrunnsarbeidet feiler.
- [ ] Mål flere kjøringer for eksisterende eiendom, nylig forespørsel, undertrykt
  mottaker og ny eiendom.

**Ferdig når:** responskode, tekst og observerbar responstid ikke pålitelig avslører
om eiendommen allerede finnes.

## F-09 – bruk lokal suppressionstatus i offentlige flyter (lav)

**Foreslått rettelse**

- [ ] Bruk den lokale `email_suppressions`-tabellen ved offentlige forespørsler.
- [ ] Synkroniser leverandørens suppressionlister i en avgrenset planlagt jobb med
  paginering, idempotens, sist-synkronisert-status og kontrollert retry.
- [ ] Behold webhooken som raskeste oppdateringskilde og gjør synkroniseringen til
  reparasjon/konsistenskontroll.
- [ ] Test utdatert lokal status, MailerSend-feil, mange sider, duplikater og at én
  offentlig request ikke kan utløse en kjede av leverandørkall.

**Ferdig når:** ingen offentlig request leser suppressionlisten direkte fra
MailerSend.

## F-10 – sikker filopplasting og metadatafjerning (middels)

**Foreslått rettelse**

- [ ] Fjern støtte for gamle makrokompatible Office-formater og ZIP inntil et
  eksplisitt behov og en sikker behandlingsflyt er dokumentert.
- [ ] Valider filtype med både tillatt endelse, MIME, filsignatur og intern struktur.
  Avvis OOXML-filer med makroinnhold som `vbaProject.bin`.
- [ ] Sett grense på request body før hele filen leses, filstørrelse, pikselantall,
  dekodet størrelse og behandlingstid.
- [ ] Re-enkod bilder med eksplisitt `limitInputPixels`, korrekt orientering og uten
  EXIF/GPS/andre metadata. Lagre og server den rensede varianten som original.
- [ ] Innfør skadevareskanning før filen blir tilgjengelig. Velg løsning som passer
  Netlify/Object Storage, og bruk karantene/status frem til skanning er godkjent.
- [ ] Server ikke-bilder som vedlegg med sikre filnavn, `nosniff` og en restriktiv
  CSP/sandbox på filresponsen.
- [ ] Test polyglot/mislabeled filer, makrofil, ZIP, stor/dekompresjonskrevende fil,
  korrupt bilde og JPEG med GPS-metadata.

**Ferdig når:** ikke-godkjente filer aldri publiseres, og nedlastet bilde ikke
inneholder opplastet metadata.

## F-11 – avgrens survey-preview-token (lav)

**Foreslått rettelse**

- [ ] Reduser standard levetid fra 24 timer til mellom én og fire timer.
- [ ] Skill signeringsnøkkelen fra sikkerhetshendelser og rate-limit-nøkler ved
  separate hemmeligheter eller HKDF-utledede delnøkler med faste formålsnavn.
- [ ] Legg inn `jti` og serverlagret tilbakekalling bare dersom redaktører faktisk
  trenger å kunne deaktivere en delt lenke før utløp; ellers behold kortlevd,
  stateless token.
- [ ] Unngå varig token i logger/referrer, og kontroller caching av preview-svar og
  vedlegg.
- [ ] Test utløp, feil miljø/formål, nøkkelrotasjon og eventuell tilbakekalling.

**Ferdig når:** en lekket preview-lenke har kort skadeperiode og ikke deler
signeringsnøkkel direkte med andre sikkerhetsformål.

## F-12 – databaseprivilegier, oppbevaring og sletting (middels)

**Foreslått rettelse**

- [ ] Kartlegg nødvendige SQL-operasjoner per offentlig flyt, adminflyt,
  bakgrunnsjobb og migrering før roller opprettes.
- [ ] Skill minst migreringseier fra runtime-bruker. Vurder egen admin-/jobbrolle
  dersom Netlify-arkitekturen kan velge tilkobling pålitelig uten å øke
  hemmelighetseksponeringen.
- [ ] Fjern `PUBLIC`-rettigheter og gi eksplisitte minstebehovstilganger. Runtime
  skal ikke eie tabeller, kunne endre triggere eller administrere auditstrukturen.
- [ ] Ikke innfør RLS bare for å kunne krysse av funnet. Innfør det kun dersom
  identitet/transaksjonskontekst kan settes sikkert for hver request og testes
  ende-til-ende.
- [ ] Vedta oppbevaringstid og formål for sesjoner/tokens, sikkerhetshendelser,
  leverings-/webhooklogger, revisjonslogg og undersøkelsesdata. Forslaget i rapporten
  er et utgangspunkt, ikke en automatisk beslutning.
- [ ] Lag godkjente oppryddingsjobber med metrics, tørrkjøring og audit. Bruk
  partisjonering bare der volum og driftsgevinst forsvarer kompleksiteten.
- [ ] Lag en dokumentert prosedyre for retting, sletting og pseudonymisering som
  samtidig bevarer lovpålagt regnskaps-/foreningsdokumentasjon og revisjonsloggens
  integritet. Ikke rediger append-only audit-rader ad hoc.
- [ ] Test rolleprivilegier og slette-/pseudonymiseringsprosedyre på isolert
  Neon-gren før nye produksjons-URL-er tas i bruk.

**Ferdig når:** runtime ikke har eierrettigheter, oppbevaring har vedtatte grenser,
og en dokumentert og testet personvernforespørsel kan håndteres kontrollert.

## F-13 – varsle ved eierskifte og kontaktendringer (lav)

**Foreslått rettelse**

- [ ] Varsle gammel hovedadresse når eierskifte forespørres og når det godkjennes,
  uten å sende den nye eierens unødvendige personopplysninger.
- [ ] Varsle hovedadressen når ekstra kontaktadresser legges til eller fjernes.
- [ ] Vis gammel og foreslått ny verdi tydelig i adminbehandlingen, og krev
  bekreftelse på at identiteten er kontrollert etter foreningens rutine.
- [ ] Send via eksisterende transaksjonelle utboks slik at feil kan følges opp
  uten at databaseendringen sendes flere ganger.
- [ ] Test kompromittert sesjon, undertrykt/gammel adresse, retry og at varselet
  ikke inneholder tilgangstoken eller mer persondata enn nødvendig.

**Ferdig når:** berørte kontakter får et etterprøvbart varsel om endringen og kan
melde fra om misbruk.

## F-14 – rydd person- og driftsmetadata i offentlig repo (middels)

**Foreslått rettelse**

- [ ] Verifiser først hvilke filer som fortsatt inneholder EXIF/GPS, reelle
  administratoradresser, Neon-gren-/snapshot-ID-er eller andre driftsdetaljer.
- [ ] Flytt lokale originalbilder ut av repoet, legg katalogen i `.gitignore`, og
  behold bare metadatafrie publiseringsvarianter i Git.
- [ ] Erstatt reelle privilegerte adresser i tester med reserverte testdomener.
- [ ] Saniter offentlig dokumentasjon og flytt detaljerte produksjonslogger til et
  egnet privat sted. Behold det som faktisk trengs for reproduserbar drift.
- [ ] Legg til en korrekt `/.well-known/security.txt` med godkjent kontakt,
  utløpsdato og policylenke.
- [ ] Vurder historikkrensing som en egen, eksplisitt godkjent operasjon. Dokumenter
  at force-push ikke fjerner eksisterende kloner, forks eller cacher, varsle alle
  bidragsytere og ta en sikker sikkerhetskopi før eventuell omskriving.
- [ ] Gjør en ny metadata- og hemmelighetsskann etter oppryddingen.

**Ferdig når:** aktiv gren ikke inneholder unødvendige person-/driftsmetadata, og
det er tatt en dokumentert beslutning om Git-historikken.

## F-15 – CI og leverandørkjede (middels)

**Foreslått rettelse**

- [ ] Legg inn Dependabot for npm og GitHub Actions med kontrollert ukentlig plan.
- [ ] Pin tredjeparts-actions til gjennomgåtte commit-SHA-er med versjon i kommentar.
- [ ] Legg til CodeQL og produksjonsrettet avhengighetsskann i CI. Definer hvordan
  funn, falske positiver og midlertidige unntak eies og utløper.
- [ ] Vurder `npm ci --ignore-scripts` i CI etter at bygg/test er prøvd med denne
  innstillingen. Ikke slå det på dersom nødvendige native pakker blir stående
  uinitialisert; dokumenter i så fall hvilke scripts som er nødvendige.
- [ ] Legg til `CODEOWNERS` for autentisering, proxy, adminpolicy,
  bakgrunnsfunksjoner og databaseskjema når faktiske eiere er avklart.
- [ ] Gjennomgå beta- og lite vedlikeholdte avhengigheter, særlig Auth.js,
  Material Tailwind og ExcelJS/transitive pakker. Oppgrader eller erstatt basert på
  konkrete vedlikeholds- og sårbarhetsdata, ikke bare versjonsnavnet.
- [ ] Aktiver påkrevde CI-sjekker og minst én godkjenning på `main` etter eksplisitt
  godkjenning av GitHub-endringen.

**Ferdig når:** alle commits og avhengighetsendringer kontrolleres automatisk, og
CI har minst mulige rettigheter med reproduserbar installasjon.

## F-16 – nettleser- og responsherding (lav)

**Foreslått rettelse**

- [ ] Sett `poweredByHeader: false`.
- [ ] Fjern autentiserings-/databaseorientert `Server-Timing` i produksjon, eller
  reduser det til ufølsomme totalmål etter en dokumentert beslutning.
- [ ] Legg til og kompatibilitetstest relevante COOP/CORP- og utvidede
  `Permissions-Policy`-headere. Ikke sett `Cross-Origin-Resource-Policy: same-origin`
  ukritisk på ressurser som legitimt skal bygges inn eller lastes på tvers av origin.
- [ ] Sandbox Norgeskart-iframe med minst mulige tillatelser, og test at kart,
  lenker, tastatur og mobil fortsatt virker.
- [ ] Etabler CSP-rapportering til et godkjent endepunkt uten sensitive URL-data.
  Behold `style-src 'unsafe-inline'` som et eget kompatibilitetsarbeid inntil
  Tailwind/Material Tailwind/Leaflet er testet uten det.
- [ ] Avgjør om apex-domenet skal registreres for HSTS preload. Fjern `preload`
  dersom foreningen ikke vil påta seg kravene for hele domenet og subdomener.
- [ ] Test faktiske produksjonsheadere, Entra-innlogging, kart, CMS og survey etter
  endringene.

**Ferdig når:** headerne gir reell herding uten å blokkere autentisering, kart eller
andre godkjente integrasjoner.

## F-17 – beskytt bruksstatistikk-endepunktet (lav)

**Foreslått rettelse**

- [ ] Legg endepunktet under den delte rate-limiten med en grense som tåler normal
  navigasjon og ikke bruker varige personidentifikatorer.
- [ ] Valider tillatte sider/hendelser og behold liten bodygrense.
- [ ] Vurder batch/buffer bare dersom målinger viser at databaseskrivingene er et
  reelt kostnads- eller kapasitetsproblem.
- [ ] Test forfalsket side, stor body, høy kallrate og at normal navigasjon fortsatt
  telles korrekt.

**Ferdig når:** én klient ikke kan forfalske store volum eller produsere ubegrenset
databasearbeid.

## F-18 – surveyvarsling, auditdata og karttjenester (lav/middels)

F-18 består av tre ulike forhold og skal ikke behandles som ett generelt
personvernproblem.

### F-18a – varsling til hoved-e-post er et svindelvern

- [ ] Behold kvitteringen til tomtens hoved-e-post med hvilken **registrert**
  e-postadresse som leverte svaret, tidspunkt, om svaret ble tellende, og registrerte
  spørsmål/svar. Dette er et tilsiktet tiltak for å oppdage svindel eller misbruk.
- [ ] Behold at hovedkontakten godkjenner ekstra adresser på tomten. Logg hvem som
  legger dem til eller fjerner dem, og bruk F-13-varsel ved endringer.
- [ ] Verifiser med tester at bare en mottakeradresse som er bundet til den konkrete
  invitasjonen/svarsesjonen kan registreres som respondent. En vilkårlig adresse fra
  request body skal aldri godtas som identitet.
- [ ] Behold første tellende svar i tråd med svaromfanget; senere forsøk skal ikke
  erstatte det effektive svaret, men kan varsles på en kontrollert måte.
- [ ] Forklar før innsending at besvarelsen knyttes til tomten og at hovedkontakten
  får en kontrollkvittering med avsender og svar. Ikke omtale undersøkelsen som anonym.

### F-18b – mottakerlisten i selve invitasjonen

- [ ] Avklar om ekstra mottakere trenger å se alle andre registrerte adresser.
  Anbefalt standard er at hovedkontakten kan se godkjente adresser i sin innloggede
  profil og i kontrollkvitteringen, mens invitasjonen til øvrige mottakere bare sier
  «Invitasjonen kan være sendt til flere registrerte mottakere på samme tomt».
- [ ] Dersom produktbeslutningen er at også ekstra mottakere skal se hele listen,
  dokumenter formålet og informer hovedkontakten tydelig når adressene registreres.
- [ ] Test invitasjon med én og flere adresser, hoved-/ekstra mottaker og at
  kvitteringen fortsatt inneholder nødvendig svindelkontroll.

### F-18c – surveyinnhold i revisjonsloggen

- [ ] Skill administrativ revisjon fra surveyresultater. For fremtidige
  `survey_responses`-hendelser skal audit normalt inneholde hendelse, respons-ID,
  survey-ID, medlems-/tomtereferanse, spørsmålsversjon og tidspunkt, men ikke en
  ekstra kopi av hele spørsmålene, svarene, respondentens e-post eller sesjons-ID.
- [ ] Behold tilgang til svar der den hører hjemme, under surveyrettighetene, og
  behold kontrollkvitteringen til hoved-e-post. Reduksjon i audit svekker dermed
  ikke svindelkontrollen.
- [ ] Ta en egen beslutning om eksisterende audit-rader basert på vedtatt
  oppbevaring og krav til revisjonsintegritet. Ikke omskriv historikken automatisk.
- [ ] Test at relevante metadata fortsatt logges atomisk, at svar ikke vises i
  **Brukerendringer**, og at surveyresultater/kvitteringer fortsatt fungerer.

### F-18d – adresseoppslag hos eksterne karttjenester

- [ ] Ikke send adressen til Geonorge automatisk bare fordi den lukkede
  kartkomponenten rendres. Start oppslaget først etter en tydelig brukerhandling.
- [ ] Foretrekk lagrede koordinater eller et kontrollert, cachet serversideoppslag
  dersom dette reduserer gjentatt deling uten å introdusere unødvendig lagring.
- [ ] Vurder ekstern lenke i stedet for iframe dersom det dekker behovet. Behold
  `no-referrer` og bruk sandbox dersom iframe beholdes.
- [ ] Oppdater personverninformasjonen med leverandør, hvilke data som sendes,
  formål og når oppslaget skjer.
- [ ] Test at ingen Geonorge-/Norgeskart-request skjer før brukerhandling, og at
  kartet fortsatt er tilgjengelig med tastatur og på mobil.

**Ferdig når:** svindelvarslingen til hovedkontakten er bevart og testet, vilkårlige
respondentadresser avvises, unødvendig mottaker-/auditdeling er avklart eller
redusert, og kartoppslag ikke skjer skjult ved vanlig sidevisning.

## F-19 – valider alle applikasjonshemmeligheter (lav)

**Foreslått rettelse**

- [ ] Lag én server-only konfigurasjonsvalidering for autentiserings-, jobb-,
  webhook- og signeringshemmeligheter.
- [ ] Krev minst 32 tilfeldige byte eller et dokumentert tilsvarende entropinivå;
  ikke bruk bare antall JavaScript-tegn som sikkerhetsmål dersom verdien kan være
  base64/hex/passordtekst.
- [ ] Avvis tomme verdier, kjente eksempelverdier, like hemmeligheter på tvers av
  formål og hemmeligheter som ved feil har `NEXT_PUBLIC_`-navn.
- [ ] Kjør valideringen ved produksjonsoppstart og i hver Netlify-funksjon som kan
  starte separat. Byggkontroll brukes bare der hemmeligheten faktisk skal være
  tilgjengelig under bygg; produksjonshemmeligheter skal ikke unødvendig inn i
  build-miljøet.
- [ ] Dokumenter sikker generering og rotasjon uten å logge verdi eller fingerprint
  som kan misbrukes.
- [ ] Test manglende, svak, gjenbrukt og gyldig hemmelighet for webapp og
  bakgrunnsfunksjoner.

**Ferdig når:** produksjonsprosesser feiler lukket før de behandler trafikk dersom
en nødvendig hemmelighet er svak, mangler eller brukes til flere uforenlige formål.

## Samlet verifikasjon før produksjon

- [ ] Kjør full `npm run check`, `npm audit` og relevante databaseintegrasjonstester.
- [ ] Kjør en avgrenset dynamisk test i staging med syntetiske data for F-01,
  F-03, F-05, F-06, F-07 og F-10.
- [ ] Verifiser Entra-login, rolleavslag, step-up, medlemstilgang, eierskifte,
  surveyinnsending/kvittering, CMS-filer, offentlig kart og administratorkart.
- [ ] Kontroller CSP og øvrige sikkerhetsheadere i en faktisk deploy uten blokkerte
  legitime ressurser i nettleserkonsollen.
- [ ] Kontroller at logger, audit, e-post og sikkerhetshendelser ikke inneholder
  tokens, hemmeligheter eller unødvendige personopplysninger.
- [ ] Oppdater `README.md`, personverninformasjon, driftsrutiner og denne listen med
  faktisk sluttstatus og eventuelle aksepterte restrisikoer.
- [ ] Bestill en avgrenset ekstern retest av minst F-01, F-03, F-05, F-06 og F-10
  etter gjennomført fase 1–2.

## Anbefalt rekkefølge

1. Prioritet 0 og raske kodeforbedringer: F-04, F-14 aktiv gren, F-15, F-19.
2. Tilgang og offentlige angrepsflater: F-01, F-03, F-05, F-06 og F-07.
3. Data- og filflyt: F-08, F-09, F-10, F-13 og F-18.
4. Større arkitektur og styring: F-02 og F-12.
5. Herding: F-11, F-16 og F-17, etterfulgt av samlet stagingtest og ekstern retest.

## Estimert tokenbruk for hele gjennomføringen

Estimatet gjelder analyse, kode, tester, dokumentasjon, feilretting og gjennomgang
utført med kodeagent. Manuelt arbeid i Entra, Netlify, Neon, GitHub og MailerSend,
venting på deploy og en ekstern retest bruker arbeidstid, men kan ikke estimeres
meningsfullt som modelltoken. Produksjonsendringer forutsetter egne godkjenninger.

Kredittestimatet bruker opplysningen i det vedlagte prisbildet om at én intern
OpenAI-kreditt tilsvarer **USD 0,040 i OpenAI-forbruk** (USD 0,043 fakturert når
internkostnaden tas med). Som beregningsgrunnlag brukes
[GPT-5.6 Sols offentlige API-pris](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
21. september 2026: USD 4 per million inputtoken og USD 20 per million outputtoken.
Det antas 85 prosent input og 15 prosent output, inkludert reasoning, uten cache-rabatt.
Det tilsvarer omtrent **160 kreditter per million samlede token**.

| Arbeidsdel | Omtrentlig tokenbruk | Estimerte OpenAI-kreditter |
|---|---:|---:|
| Innledende kartlegging og Prioritet 0 | 10 000–20 000 | 1,6–3,2 |
| F-04, F-14, F-15 og F-19 | 45 000–70 000 | 7,2–11,2 |
| F-01, F-03, F-05, F-06 og F-07 | 90 000–140 000 | 14,4–22,4 |
| F-08, F-09, F-10, F-13 og F-18 | 75 000–120 000 | 12,0–19,2 |
| F-02 og F-12 | 70 000–120 000 | 11,2–19,2 |
| F-11, F-16, F-17 og samlet verifikasjon | 40 000–70 000 | 6,4–11,2 |
| **Totalt sannsynlig intervall** | **330 000–540 000** | **52,8–86,4** |

Et realistisk planleggingstall er **omtrent 430 000 token / 69 kreditter**. En
arbeidsramme på **500 000 token / 80 kreditter** er et foreløpig Sol-budsjett.
Dette ligger innenfor Bronze-grensen på 300 kreditter i prisbildet, men gir ingen
garanti for at hele arbeidet kan fullføres innenfor rammen.

Dette er et kostnadsestimat, ikke en direkte måling fra kredittsystemet. Faktisk
forbruk påvirkes av valgt modell, forholdet mellom input/output, prompt-cache,
resonnering og eventuelle prisede verktøykall. Estimatet kan reduseres når
produktvalgene for det offentlige kartet, topartsgodkjenning, filskanning,
datalagring og eventuell Git-historikkrensing er besluttet. Etter første
arbeidspakke bør estimatet kalibreres mot faktisk rapportert kredittbruk.

### Sammenligning av Astra, Sol og Terra

Priser per million token ved Standard-behandling, kontrollert 21. september 2026
mot [OpenAIs modellsammenligning](https://developers.openai.com/api/docs/models/compare).

| Modell | Input, USD | Cachet input, USD | Output inkl. reasoning, USD | Kreditter ved 500 000 token og 85/15-fordeling |
|---|---:|---:|---:|---:|
| GPT-6 Astra | 10,00 | 1,00 | 50,00 | 200 |
| GPT-5.6 Sol | 4,00 | 0,40 | 20,00 | 80 |
| GPT-5.6 Terra | 2,00 | 0,20 | 12,00 | 43,75 |

Beregning: `(inputtoken × inputpris + outputtoken × outputpris) / 1 000 000 / 0,040`.
USD fakturert etter bildet er `kreditter × 0,043`. Bildet bekrefter ikke at
virksomhetens ChatGPT-/Codex-avtale faktisk avregnes direkte etter API-pris;
alle kredittall her er derfor betinget av denne antakelsen.

### Reasoning-nivåer – budsjettscenarier for hele arbeidslisten

OpenAI oppgir ingen fast tokenmultiplikator per reasoning-nivå. Reasoningtoken
[faktureres som output](https://developers.openai.com/api/docs/guides/reasoning).
For å gi et sammenlignbart estimat brukes det tidligere intervallet
330 000–540 000 token som en **antatt medium-referanse**, ikke en målt baseline.
Input holdes konstant på 85 prosent av referansen, mens de resterende 15 prosent
output skaleres med faktorene i tabellen. Faktorene er egne illustrerende
budsjettantakelser, ikke dokumenterte egenskaper ved modellene eller statistiske
konfidensintervaller. Samme tokenmengde på alle modeller isolerer prisforskjellen;
faktisk antall arbeidsrunder og token kan være forskjellig.

| Reasoning | Antatt outputfaktor mot medium | Samlede token, ca. | Astra, kreditter | Sol, kreditter | Terra, kreditter |
|---|---:|---:|---:|---:|---:|
| `none` | 0,25× | 293 000–479 000 | Ikke støttet | 34–56 | 18–29 |
| `low` | 0,50× | 305 000–500 000 | 101–165 | 40–66 | 21–35 |
| `medium` | 1,00× | 330 000–540 000 | 132–216 | 53–86 | 29–47 |
| `high` | 1,50× | 355 000–581 000 | 163–267 | 65–107 | 36–59 |
| `xhigh` | 2,00× | 380 000–621 000 | 194–317 | 78–127 | 44–72 |
| `max` | 3,00× | 429 000–702 000 | 256–419 | 102–167 | 59–96 |
| `ultra`* | 4,00× | 479 000–783 000 | 318–520* | 127–208* | 73–120* |

`none` betyr uten separat reasoning; synlig output koster fortsatt penger.
De offentlige modellsidene dokumenterer `low`, `medium`, `high`, `xhigh` og `max`
for [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), og i tillegg
`none` for [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) og
[Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra).

*`ultra` tilbys i agentoppsettet i denne økten, men er ikke dokumentert som et
offentlig API-nivå på disse modellsidene. Raden er kun en ekstra budsjettreserve
ved samme tokenpris; eventuell annen modellruting eller avregning må bekreftes.
`minimal` er ikke oppført som støttet for disse modellene.

Tabellen forutsetter Standard-pris, høyst 272 000 inputtoken i hver enkelt request,
ingen cachelesing/-skriving, ingen regionale tillegg og ingen prisede verktøykall.
Samlet tokenbruk over mange requests utløser ikke i seg selv langkontekstpris.
Fast/Priority og andre avtalevilkår er ikke inkludert. Input kan også øke ved høyere
reasoning gjennom flere verktøykall og gjentatt kontekst; dette er ikke modellert.

Den tidligere konklusjonen om at Bronze er tilstrekkelig gjelder dermed bare det
opprinnelige Sol-scenariet. Astra ved høyere reasoning kan overstige 300 kreditter
allerede i disse illustrative beregningene. Kalibrer mot en ferdig arbeidspakke
med registrerte input-, cache-, output-/reasoningtoken og faktisk kredittrekk før
tabellen brukes som innkjøps- eller gjennomføringsbudsjett.

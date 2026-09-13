# ToDo #

## Test ##

- Testdekningen er reell, men smal: 18 testfiler dekker enkelt-lib-moduler (rate-limit, tokens, e-postmaler osv.), men det finnes ingen tester på selve API-rutene (app/api/*) og ingen UI-tester for de 19 komponentene. lib/matrikkel-sync.js (363 linjer, kompleks synk-logikk) har heller ingen egen testfil. Dette trekker det reelle testarbeidet noe ned sammenlignet med hva 12 350 linjer normalt ville tilsi.
- 
## Sikkerhet ##

- grundig gjennomgang basert på repo - innbruddsforsøk
- 

## Applikasjon ##

- Favicon må bruke logo med lys bakgrunn, eller kan sånn logo være følsom for lyst/mørkt brukergrensesnitt?
- Mangler	Kommentar
  LICENSE-fil	Ingen LICENSE/LICENSE.md. package.json har heller ikke et "license"-felt. Siden "private": true er satt, er dette trolig bevisst (internt/lukket prosjekt for velforeningen), men verdt å bekrefte at det er tilsiktet
  Repo-beskrivelse og topics	Bekreftet fra GitHub-siden tidligere ("No description, website, or topics provided")
  CONTRIBUTING.md / CODE_OF_CONDUCT.md	Ikke til stede — normalt greit å utelate for et lukket, ett-utvikler-prosjekt
  CHANGELOG.md	Ingen endringslogg, til tross for at dette er et system i aktiv produksjonsdrift med jevnlige sikkerhetsoppdateringer
  .editorconfig	Ikke funnet
- .github/workflows/ mangler i denne zip-en — GitHub-siden din viste tidligere at denne mappen finnes i repoet (med ci.yml), men den er ikke med i filen du lastet opp. Sannsynligvis har zip-verktøyet ditt hoppet over denne skjulte mappen. Jeg får dermed ikke sett selve CI-konfigurasjonen.
  .neon og skills-lock.json er inkludert, selv om begge er eksplisitt gitignored. Dette er ikke hemmeligheter (.neon inneholder bare et Neon org-/prosjekt-ID, ingen passord), men det bekrefter at zip-en er tatt av arbeidsmappen din lokalt — ikke en ren git clone/git archive. Ikke kritisk, men verdt å være obs på neste gang du deler kode, i tilfelle andre gitignorede filer (f.eks. .env.local) skulle blitt med ved et uhell. Denne gangen var det rent — ingen ekte secrets funnet noe sted i arkivet.
  skills-lock.json avslører for øvrig at prosjektet bruker AI-agent-skills (neondatabase/agent-skills) i utviklingen, og SIKKERHETSPLAN.md viser at koden nylig (11.–12. september 2026) gjennomgikk en ekstern sikkerhetsgjennomgang med 8 funn som er lukket i kode. Litt ironisk kontekst gitt at vi estimerer "uten AI", men nyttig bakgrunn.

## Medlemsregister ##

- hvordan utelukke medlemmer/tomter fra mailutsendeles?
- feks. Turufjell, utbyggere, entreprenører
- hvordan sende samlemail når samme epost er rgistrert på flere tomter
- vise grupperinger, når samme mail er registrert på flere tomter
- linken som sendes ved forespørsel varer i 15 min, den burde stå på forsoden Lenken er personlig, varer i 15 minutter og skal ikke videresendes. Hvis knappen ikke virker, kopier denne adressen
- mulighet til å reservere seg mot å utveksle info med Turufjell AS
- Når man vil endre detaljer, så bør man få mulighet for å lage en kommentar, da skal det komme en melding i oppgavelisten
- gruppere tomter, i grender
- 

## Undersøkelser ##

- 

## CMS ##

- Tekstformattering

## Nyhetsbrev ##

- lage nyhetsbrev som kan sendes

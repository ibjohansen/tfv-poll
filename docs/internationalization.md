# Språk og oversettelser

Applikasjonens grensesnitt støtter norsk bokmål (`nb`) og engelsk (`en`). Norsk
er standardspråk. Første besøk bruker `Accept-Language` når nettleseren ber om
et støttet språk; brukerens valg lagres deretter i den sikre, HTTP-only cookien
`tfv_locale` i ett år.

## Struktur

Oversettelsene ligger i `locales/nb` og `locales/en`, gruppert etter område:

- `general.js` – navigasjon, språkvelger og felles handlinger
- `public.js` – forside og andre offentlige flater
- `members.js` – medlemsregister og selvbetjening
- `map.js` – offentlig kart, administratorkart og kart-API
- `surveys.js` – undersøkelser og resultater
- `cms.js` – nettsider og riktekst
- `email.js` – administrasjon av e-post og nyhetsbrev
- `admin.js` – administrasjon, brukerlogg og bruksstatistikk
- `backend.js` – lokaliserte API-svar

`LocaleProvider` gjør samme ordliste tilgjengelig i klientkomponenter, mens
`getServerI18n()` og `getRequestI18n()` brukes i henholdsvis serverkomponenter
og API-ruter. Den vedvarende språkvelgeren i sidetoppen bruker et globeikon og
språkenes egne navn, **Norsk** og **English**. Valget navigerer til samme side
med den delbare parameteren `?lang=nb` eller `?lang=en`; proxyen bruker denne
verdien for samme respons og lagrer deretter språkoden i cookien. Den eldre
`POST /api/locale` beholdes for kompatibilitet. Ingen av mekanismene lagrer
brukeridentifikator eller annen personopplysning.

Nye nøkler må opprettes i begge språk. `tests/i18n.test.mjs` kontrollerer at
ordlistene har identiske, ikke-tomme nøkler. Variabler settes inn med navngitte
plassholdere, for eksempel `t('summary', { count, name })`.

## Hva oversettes

All fast grensesnitttekst, tilgjengelighetsetiketter, valideringsmeldinger,
brukerrettede API-feil og dynamiske kartadvarsler skal hentes fra ordlistene.
Datoer og tall formateres med `nb-NO` eller `en-GB`. Kartets mellomlager har
språk i cache-nøkkelen, slik at norsk og engelsk tekst ikke blandes.

Følgende er med hensikt ikke oversatt:

- bruker-, medlems- og CMS-innhold fra databasen
- grendenavn, adresser, egennavn og kildenavn som Kartverket og Geonorge
- stabile databaseverdier og maskinkoder som `MATCH`, `member` og `pending`
- interne logger og feil som bare er ment for drift
- filnavn, rutenavn og API-feltnavn

Transaksjonelle e-poster og eksportkolonner er fortsatt på norsk. Det er
bevisst: én administrators språkvalg skal ikke bestemme språket til alle
mottakere, og registeret lagrer foreløpig ikke språkpreferanse per medlem.
Før disse sendes på engelsk må en mottakerspesifikk språkpreferanse innføres;
inntil da er norsk den entydige og stabile kommunikasjonsformen.

## Legge til et språk

1. Legg språkoden til i `SUPPORTED_LOCALES` og `FORMAT_LOCALES` i
   `lib/i18n/config.js`.
2. Kopier mappestrukturen under `locales/nb`, oversett alle verdier og legg
   ordlisten til i `locales/index.js`.
3. Legg språket til i `LanguageSwitcher`.
4. Kjør `npm run check`. Nøkkeltesten skal feile dersom en oversettelse mangler.

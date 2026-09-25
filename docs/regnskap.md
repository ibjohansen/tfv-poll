# Regnskap

Modulen ligger under **Regnskap** i administrasjonen. Den gir en løpende oversikt
ved siden av vellets ordinære regnskap. Kalenderåret er regnskapsperiode;
årsmøtet i april får forrige års regnskap og inneværende års budsjett.

## Grunnlag fra protokollen

`data/accounting.js` inneholder manuelt kontrollerte tall fra
`Protokoll-2026.pdf`, side 3–5. Resultat- og balansesidene er bilder i PDF-en og
er kontrollert visuelt. Selve protokollen, ZIP-filen, personopplysningene,
Excel-arkene og de private bilagene er ikke kopiert inn i repositoriet.

- Budsjett 2026: 411 medlemmer × 250 kr = 102 750 kr. Kostnader 93 000 kr,
  budsjettert resultat 9 750 kr.
- Regnskap 2025: driftsinntekter 106 120 kr, driftskostnader 67 387,31 kr,
  påminnelsesavgift 2 050 kr, årsresultat 40 782,69 kr.
- Balanse 31.12.2025: eiendeler 49 636,85 kr, egenkapital 47 844,28 kr og
  gjeld 1 792,57 kr. Balansen vises som historisk referanse.

Protokollens innledende punkt bruker årstallet 2024, mens den detaljerte
regnskapsrapporten uttrykkelig gjelder 2025. Modulen følger rapportens årstall.
Årsberetningens avrundede styrehonorar erstatter ikke detaljregnskapets tall.
Kontoene 6454 (datautstyr), 7430 (gaver) og 7830 (tap på fordringer) grupperes
under budsjettposten 6890 (andre kostnader). Bankgebyrer står på konto 7770 i
regnskapet, men på 7700 i budsjettet. Utleiehenger har ingen oppgitt kontokode.

## År og budsjett

1. Velg år, og åpne **Budsjett og inntekter**. Første forslag for 2026 bruker
   protokollen. Nye år viderefører siste lagrede budsjett og årskontingent.
2. Kontroller forventet medlemsantall. **Bruk medlemmer fra registeret** teller
   aktive medlemstomter, uten slettede og fritatte tomter. Antallet lagres som
   et snapshot; senere registerendringer endrer ikke et lagret budsjett.
3. Juster kontingent og budsjettposter. Kontingentinntekten beregnes på serveren
   fra antall × sats. Satsen er 250 kr som standard og konfigureres per år.
4. Registrer avstemte, faktiske inntekter. Tomt felt betyr ukjent, mens 0 betyr
   bekreftet null. Betaltmerking i medlemsregisteret er en kontrollopplysning
   og blir ikke automatisk gjort om til regnskapsinntekt.
5. Lagre året før kostnader eller bilag opprettes.

## Kostnader og leverandørbatcher

Velg opptil 30 kvitteringer fra samme leverandør. Opplastingen sender én fil om
gangen, slik at filene ikke samlet overskrider funksjonsplattformens grense.
Hver fil kan være PDF, JPG, PNG eller WebP på høyst 3 MB. Filendelse og signatur
kontrolleres på serveren. Opplastede, uregistrerte bilag vises også etter
omlasting og kan tas med i en senere registrering.

PDF-lesingen gjenbruker leverandørreglene fra `scan_tf_fakturaer.py` i den
opplastede lokale løsningen. Mailchimp, Microsoft, Netlify og Hallingdølen har
egne beløpsregler; øvrige fakturaer bruker eksplisitt angitt total og valuta.
Felt er forslag: administrator må bekrefte hvert bilag. Betalingskortets siste
fire sifre brukes ikke som beløp. PDF-lesingen setter aldri levert-/utbetaltstatus.
Bilder, store PDF-er (over 20 sider), skannede eller passordbeskyttede PDF-er
krever manuell utfylling. Det er ingen OCR-tjeneste eller ekstern AI-overføring.
Ved lokal kontroll av alle 27 PDF-er i det leverte arkivet fant leseren beløp,
valuta, dato og fakturanummer. Beløp og valuta stemte i 27 av 27 tilfeller med
arkivets `engine/tf_fakturaer.csv`. Dette bekrefter de leverte eksemplene,
ikke at fremtidige leverandørformater kan godkjennes uten manuell kontroll.

Angi kurs som **NOK per én enhet av originalvalutaen**. En kostnad på USD 16,25
med kurs 10,123456 blir NOK 164,51. NOK krever kurs 1. Originalbeløp, valuta,
kurs med inntil seks desimaler og avrundet NOK-beløp beholdes. Beregningen bruker
heltall og avrunder én gang til øre. Felles kategori/valuta/kurs kan settes for
batchen, mens dato, beløp og fakturanummer beholdes per bilag og må kontrolleres.

Manuelle kostnader støttes, men uten kvittering kreves en forklaring. Ved
redigering knyttes nye opplastede vedlegg til kostnaden; allerede tilknyttede
vedlegg kan ikke stille fjernes eller flyttes til en annen kostnad.

**Levert** betyr sendt til regnskapsfører/refusjonsbehandling, og **Utbetalt**
betyr refundert eller betalt av vellet. Begge lagres som datoer. Utbetaling
krever leveringsdato senest samme dag. Marker flere kostnader for samlet
statusoppdatering. Beløp og kontering er låst etter utbetaling; feilregistrert
betalingsstatus kan korrigeres eksplisitt før økonomifeltene redigeres.
Ingen betaling sendes til bank eller ekstern regnskapsfører.

## Årsmøte og eksport

**Årsmøteoversikt** åpner regnskap for valgt år og budsjett for det neste året.
Siden kan skrives ut eller lagres som PDF fra nettleseren. Ulagrede forslag og
manglende inntekter merkes tydelig. **Last ned kostnader (CSV)** eksporterer alle
kostnader for året med originalbeløp, kurs, NOK-beløp, datoer, notater og
vedleggsnavn. Potensielle regnearkformler behandles som tekst.

## Tilgang, drift og verifikasjon

Lesing og nedlasting krever eksisterende `read`-rettighet. Skriving krever
`members`; `TFV.ReadOnly` kan ikke endre data. Bilag lagres i den eksisterende
private `cms-assets`-bøtten med `accounting/<år>/`-prefiks, uten kobling til
offentlige sider. API-responser og nedlastinger har `private, no-store`.

Databasen har egne tabeller for år, kostnader og vedlegg. Kostnader fra én
batch og vedleggskoblinger lagres i samme transaksjon. SHA-256 hindrer at samme
fil registreres to ganger, og en unik indeks hindrer samme normaliserte
leverandør/fakturanummer, også på tvers av år. Oppdateringer bruker versjoner
og avviser tapte endringer. En årslås serialiserer batch- og statusendringer.
Audit-triggere lagrer hvem som endret data; private lagringsnøkler filtreres bort.
Ved ukjent resultat av en lagringsforespørsel beholdes filobjektet for å unngå
å slette et mulig lagret bilag. Ingen automatisk sletting av bilag eller historikk.

`npm run check` kjører validerings- og leverandørtester samt hele databaseskjemaet
og transaksjonstester i en lokal, midlertidig PostgreSQL/WASM-instans.
`npm run test:e2e -- tests/e2e/accounting.spec.js` tester skjermflyt, batch,
rettigheter og tilgjengelighet i en isolert appkopi med syntetiske data.
Nettlesertestene simulerer API-responser; de tester ikke Neon- eller S3-nettverk.
PGlite bruker én forbindelse og erstatter ikke en flerforbindelsestest på Neon.
`tests/integration/accounting.test.mjs` dekker i tillegg samtidige registreringer
og betalinger på ekte PostgreSQL. Fem slike tester bestod på en isolert Neon-gren
før [produksjonsmigreringen 25. september](database-release-accounting-2026-09-25.md).

Migrering og publisering ble godkjent og gjennomført 25. september 2026; se
[utrullingsrapporten](database-release-accounting-2026-09-25.md). Innlogget
produksjonskontroll gjenstår. Følg produksjonsprosedyren og sjekklisten i README
ved senere utrulling. Ingen nye miljøvariabler, bøtter, Entra-roller eller
bakgrunnsfunksjoner er nødvendige.

Arbeidsflyten er inspirert av leverandørenes beskrivelser av
[utlegg med valuta og status](https://hjelp.fiken.no/reiseregning-og-utlegg-for-ansatte)
og [kontroll av forslag fra kvitteringer](https://hjelp.fiken.no/ta-bilde-av-kvitteringer-med-mobil-app).

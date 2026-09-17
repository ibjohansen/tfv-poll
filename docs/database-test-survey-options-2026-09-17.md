# Isolert databasetest – svaralternativer og mottakere

Utført 17. september 2026 etter eksplisitt godkjenning av en midlertidig
testgren. **Dette er ikke en produksjonsmigrering eller deploy.**

Senere samme dag ble produksjonsmigrering og deploy godkjent og utført separat;
se [produksjonsrapporten](database-release-survey-options-2026-09-17.md).
Avgrensningene nedenfor beskriver den opprinnelige testkjøringen.

## Avgrensning

- Prosjekt: `ancient-wildflower-97748936`.
- Kilde for skjema: `br-misty-paper-b2tequav` (produksjonsgrenen, ikke endret).
- Testgren: `test-survey-options-20260917`, ID `br-still-mouse-b2edm30l`.
- Neon CLI 4.14.1; `init_source=parent-schema`, ikke primary/default/protected.
- Automatisk utløp: **18. september 2026 kl. 22:00 UTC**, altså midnatt til
  19. september norsk tid. Compute: 0,25 CU, suspenderes etter fem minutter.
- Alle **29 offentlige tabeller var tomme** før første testinnsetting.
  Ingen produksjonsrader, medlemmer, eksport eller private filer ble kopiert.
- Kun syntetiske `example.test`-kontakter, simulert e-posttransport og filstorage.
  Ingen faktiske invitasjoner, kvitteringer eller eksterne filkopier ble sendt.
- `.env.local`, produksjonsdatabase, Netlify og GitHub er ikke endret.

Schema-only-grenen er en isolert rotgren som kopierer skjema, ikke rader;
se [Neons dokumentasjon](https://neon.com/docs/guides/branching-schema-only).
Den skal **ikke** resettes fra produksjon, siden det ville kopiere data.

## Resultater

- **57/57 Postgres-integrasjonstester bestått**, ingen hoppet over.
- **317/317 enhetstester**, lint og produksjonsbygg bestått (`npm run check`).
  Bygget ble kjørt med tomme databasevariabler og deaktivert e-post. Next logger
  forventet manglende database ved cachefylling; byggkommandoen avsluttes med 0.
- `git diff --check` bestått. Ingen nye npm-avhengigheter i denne testendringen.
- De tidligere 44 nettlesertestene og fire ekstra regresjonstestene er ikke
  kjørt på nytt i denne databaserunden; endringene her gjelder server/testkode.

Testene dekker reelle SQL-transaksjoner, første svar ved konkurrerende
innsendinger, senere hovedmottakersvar, uavhengige svar, mottakerbundne tokens,
tillegg av overlappende grupper/enkelttomter og vern mot dobbeltsending.
Kvitteringsarbeideren testes med ekte databaseleie og simulert transport:
bare hovedadressen får oppsummering, samtidige arbeidere utelukkes, endret
kontakt/sperret mottaker får ikke private svar, og usikker levering sendes ikke
automatisk på nytt. Undersøkelseskopier beholder spørsmål/svarregel, men får
ingen svar, kampanjer, mottakere eller tokens fra originalen.

Før første migrering ble det lagt inn et syntetisk gammelt medlem, undersøkelse,
svar med spørsmålsøyeblikksbilde, gruppe, kampanje, leveranse og tilgangstoken.
Utvalgte kolonner ble sammenlignet etter hele testløpet og var uendret.
Det gamle svaret fikk forventet `response_key=property`; leveransen fikk korrekt
`source_group_id`. Skjemaet ble brukt gjentatte ganger med eksisterende data.

Testet `database/schema.sql`, SHA-256:

```text
adeb87b2b28839172a77e7fcf85e74094ff08ead1d3bfc39712e8f143a5d5a28
```

## Funn som ble rettet

- Kopiering av eldre CMS-artikkel lagret JSON `null` i stedet for SQL `NULL`
  for manglende riktekst; dette brøt tabellens sjekkregel. Rettet og testet.
- En eldre svarøkt uten mottakerbinding kunne forsøke å lage en kvittering uten
  avsender hvis hoved-e-post var fjernet. Tilgangen avvises nå kontrollert,
  også når kontaktfeltet endres mellom lesing og innsending.
- Undersøkelseskopier bevarer nå `single_response_per_property` fra kilden.
- Manglende cache-mock og sammenligning av objekter på tvers av testens
  VM-kontekster er rettet i eldre integrasjonstester.

## Gjenta testen før automatisk utløp

```bash
node --use-system-ca scripts/test-neon-branch.mjs \
  --project ancient-wildflower-97748936 \
  --branch br-still-mouse-b2edm30l \
  --host ep-frosty-heart-b2mx2nfn.c-6.eu-central-1.aws.neon.tech
```

Kommandoen krever innlogget Neon CLI, verifiserer grenmetadata og TLS-endepunkt,
og gir forbindelsen kun til testprosessen i minnet. Testmarkør og
`application_environment=development` må stemme før test-SQL kjøres. Produksjons-
og standardgrener avvises. Kjøreren oppretter ikke grener, deployer ikke og
skriver ikke `.env`-filer. Etter utløp kreves en ny, godkjent testgren.

## Oppfølging etter testen

- [x] Eksplisitt godkjenning av koordinert produksjonsmigrering og deploy.
- [x] Kort vedlikeholdsstans i svar/utsendelser, gjenopprettingspunkt og
  radkontroll før indeksbytte. Gammel svarkode er ikke kompatibel med nytt skjema.
- [ ] Funksjonell Netlify-verifikasjon og levering til godkjente testmottakere.

Følg [produksjonsprosedyren](survey-options-and-recipients.md#før-produksjonssetting).
Denne testen bekrefter SQL-oppførsel, ikke ekte e-postlevering, Entra-innlogging,
Netlify-scheduling, produksjonsvolum eller migreringens låsetid i produksjon.

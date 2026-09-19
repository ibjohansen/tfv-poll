# Kort brukertest – kart og registerkontroll

Denne testen skal gjennomføres før produksjonssetting av den nye arbeidsflaten,
med minst én person som ikke har utviklet løsningen. Testpersonen skal ikke få
forklart fagmodellen på forhånd.

## Oppsett

- Bruk et isolert test- eller previewmiljø med syntetiske data.
- Kjør én runde på desktop og én på mobil.
- Be testpersonen tenke høyt. Ikke hjelp før personen faktisk stopper.
- Registrer ingen ekte navn, e-postadresser eller medlemsopplysninger i notatene.

## Oppgave 1: Kontroller medlemsregister

1. Be personen finne ut hva som er neste handling på startsiden.
2. Be personen velge en lagret grend og kjøre en kontroll.
3. Be personen finne én tomt som må følges opp, utsette den og åpne detaljene.
4. Be personen forklare om kontrollen har endret registeret.
5. Be personen finne hvor en eventuell matrikkeloppdatering startes, men avbryt
   i bekreftelsesdialogen.

Bestått når personen fullfører uten forklaring, forstår at kontrollen er
skrivebeskyttet, og skiller «forslag» fra «oppdater».

## Oppgave 2: Vedlikehold grend

1. Be personen bytte til grendevedlikehold og opprette en ny grend.
2. Be personen tegne en grense i kartet.
3. Gjenta med bare tastatur og koordinatfeltene.
4. Be personen forklare forskjellen mellom grendegrensen og en eiendomsteig.
5. Be personen kontrollere og lagre grenden.

Bestått når personen finner riktig rekkefølge, ikke leter etter
registeroppdatering i denne flyten, og kan fullføre uten horisontal scrolling.

## Registrering

| Dato | Enhet | Oppgave | Stopp/feilvalg | Ord som var uklare | Endring og ny kontroll |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

Produksjonssetting er ikke godkjent før observerte stopp og feilvalg er vurdert,
nødvendige ord/rekkefølger er justert, og den endrede oppgaven er prøvd på nytt.

## Automatisert grunnkontroll

Playwright dekker begge oppgavene på desktop og mobil med syntetiske data:
valg av grend, skrivebeskyttet kontroll, oppsummeringsfilter, arbeidskø,
tomtedetaljer, fokusretur, matrikkeloppfølging, oppgavebytte med bevart utkast,
tastaturpolygon og lagring. Samme scenario kjører axe mot WCAG 2 A/AA og
kontrollerer at arbeidsflaten ikke får horisontal kontroll-overflyt.

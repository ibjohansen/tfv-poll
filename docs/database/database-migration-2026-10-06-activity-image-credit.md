# Produksjonsmigrering: kreditering av aktivitetsbilder 6. oktober 2026

Status: fullført og verifisert før kodepublisering.

Migreringen ble først kjørt på en kortlivet Neon-gren opprettet fra dagens
produksjonsdata. Deretter ble et nytt, tidsbegrenset gjenopprettingspunkt
opprettet umiddelbart før produksjonskjøringen. Eksakte gren- og snapshot-ID-er
beholdes i den private driftsloggen og er ikke lagt i Git.

## Resultat

- 125 avgrensede aktivitetskartoperasjoner ble kjørt i én transaksjon.
- Alle 352 eksisterende aktiviteter ble bevart.
- Etterkontrollen fant null ugyldige geometrier eller katalogkoblinger.
- `activity_map_features.image_credit` finnes som valgfri `text`.
- `activity_map_feature_image_credit_check` begrenser verdien til trimmet tekst
  på maksimalt 160 tegn uten kontrolltegn.
- Produksjonskontrollen bekreftet samtidig at alle 14 aktive
  Alpint-aktiviteter fortsatt har hver sin bildekopi.

Ingen kreditering ble konstruert eller fylt inn automatisk. Feltet må fylles ut
av en administrator når fotograf eller rettighetshaver er kjent.

Migreringen innfører ingen ny tjeneste, rute eller miljøvariabel.

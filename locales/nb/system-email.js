// Server-rendered email copy; editorial survey content lives in data/.
const messages = {
  "footer": "Denne e-posten er sendt fra Medlemsservice i Turufjell Vel.",
  "testLabel": "Testmelding:",
  "testPrefix": "TESTMELDING – ",
  "previewNotice": "Lenken åpner en forhåndsvisning. Valg og testinnsending lagres ikke.",
  "resultsNotice": "Dette er en forhåndsvisning av resultatutsendelsen. Den er ikke sendt til medlemslisten.",
  "survey": "Medlemsundersøkelse",
  "preview": "Forhåndsvis undersøkelsen",
  "open": "Åpne undersøkelsen",
  "invitation": "Invitasjon: {title}",
  "invitationBody": "Turufjell Vel inviterer deg til å svare på undersøkelsen. Svarfristen er {deadline}.",
  "buttonHelp": "Hvis knappen ikke virker, kopier denne adressen til nettleseren:",
  "propertyPolicy": "Det registreres kun ett svar per tomt. Dersom andre enn deg får lenken og svarer først, vil dette svaret være gjeldende. Adressen som er registrert som hoved-e-post, får kvittering med spørsmål, svar og hvilken e-postadresse som sendte det tellende svaret.",
  "recipientPolicy": "Hver invitert e-postadresse kan sende inn én selvstendig besvarelse. Hoved-e-post får kvittering på innsendte besvarelser.",
  "browserHelp": "Hvis du får problemer med å åpne eller sende inn undersøkelsen, kan du åpne lenken i en vanlig nettleser som Safari, Chrome, Edge eller Firefox. Dette er særlig aktuelt på mobil hvis lenken først åpnes inne i e-postappen.",
  "recipients": "Denne invitasjonen sendes til følgende mottakere på samme tomt: {recipients}. Flere mottakere får varsel.",
  "resultsSubject": "Resultatet av medlemsundersøkelsen",
  "distribution": "Fordeling av svar",
  "signature": "Styret i Turufjell vel",
  "answers": "svar",
  "answered": "besvart",
  "question": "Spørsmål {number}",
  "version": "versjon {version}",
  "ja": "Ja",
  "nei": "Nei",
  "usikker": "Vet ikke",
  "receipt": "Kvittering: {title}",
  "accepted": "Besvarelsen er registrert og er tellende.",
  "notAccepted": "Innsendingen er mottatt, men erstatter ikke det første svaret. Kun den første besvarelsen er tellende for tomten.",
  "plot": "Tomt: {number}",
  "submittedBy": "Innsendt av: {email}",
  "effectiveRespondent": "Tellende besvarelse fra: {email}",
  "previousRecipient": "tidligere registrert mottaker",
  "subsequent": "Senere innsendt besvarelse (ikke tellende):",
  "validity": "15 minutter",
  "secureLinkHelp": "Lenken er personlig, varer i {validity} og skal ikke videresendes. Hvis knappen ikke virker, kopier denne adressen:",
  "secureLinkTextHelp": "Lenken er personlig, varer i {validity} og skal ikke videresendes. Hvis knappen ikke virker, kan du kopiere adressen ovenfor og lime den inn i nettleseren.",
  "ignore": "Har du ikke bedt om dette, kan du se bort fra meldingen.",
  "securityAlert": "Sikkerhetsvarsel",
  "access": {
    "subject": "Din sikre tilgang til medlemsopplysninger",
    "eyebrow": "Mine medlemsopplysninger",
    "heading": "Se og oppdater opplysningene dine",
    "body": "Vi har mottatt en forespørsel om tilgang til medlemsopplysningene som er registrert hos Turufjell Vel.",
    "action": "Åpne medlemsopplysningene"
  },
  "membership": {
    "subject": "Bekreft innmelding i Turufjell Vel",
    "eyebrow": "Innmelding",
    "heading": "Bekreft e-postadressen din",
    "body": "Vi har mottatt en forespørsel om å melde inn en ny tomt. Bekreft e-postadressen slik at saken merkes som bekreftet for saksbehandleren.",
    "action": "Bekreft innmeldingen"
  },
  "changeOld": {
    "subject": "Bekreft endring av hoved-e-post",
    "heading": "Bekreft at du ba om endringen",
    "body": "Noen har bedt om å endre hoved-e-post for medlemskapet. Bekreft forespørselen før vi sender en egen kontroll til den nye adressen.",
    "action": "Bekreft forespørselen"
  },
  "changeNew": {
    "subject": "Bekreft den nye hoved-e-postadressen",
    "heading": "Bekreft den nye adressen",
    "body": "Den gamle adressen er kontrollert. Bekreft at du har tilgang til den nye adressen før den tas i bruk.",
    "action": "Bekreft ny e-postadresse"
  },
  "securityCheck": "Sikkerhetskontroll",
  "changed": {
    "subject": "Hoved-e-post er endret",
    "heading": "Endringen er fullført",
    "body": "Hoved-e-post for medlemskapet er endret etter kontroll av både gammel og ny adresse. Alle eksisterende medlems- og undersøkelsesøkter er avsluttet."
  },
  "changeStarted": {
    "subject": "Forsøk på endring av hoved-e-post",
    "heading": "En endring er påbegynt",
    "body": "Det er bedt om å endre hoved-e-post for medlemskapet. Hvis dette ikke var deg, kontakt Turufjell Vel så snart som mulig."
  }
};

export default messages;

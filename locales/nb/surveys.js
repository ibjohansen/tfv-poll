const surveys = {
  common: { survey: 'Undersøkelse', surveys: 'Undersøkelser', answer: 'Svar', responses: 'Besvarelser', question: 'Spørsmål', questions: 'Spørsmål', deadline: 'Svarfrist', open: 'Åpen', closed: 'Stengt', ended: 'Avsluttet' },
  page: { metadata: 'Medlemsundersøkelse | Turufjell Vel', title: 'Turufjell Vel – medlemsundersøkelse', introduction: 'Vi ønsker medlemmenes vurdering av informasjon og forventninger knyttet til et mulig alpinanlegg på Kristnatten, og hvordan velforeningen bør arbeide videre med saken.', before: 'Før du svarer', information: 'Informasjon og dokumenter', documentHelp: 'Les gjerne relevant bakgrunnsmateriale før du sender inn besvarelsen. Dokumentene åpnes i en ny fane.', documentsComing: 'Dokumenter publiseres her', documentsComingHelp: 'Relevante vedlegg kan legges inn før undersøkelsen sendes ut til medlemmene.', questionCount: '{count} spørsmål', assessment: 'Din vurdering', answerHelp: 'Velg det alternativet som passer best for hvert spørsmål.', administration: 'Administrasjon', unavailable: 'Medlemsregisteret er midlertidig utilgjengelig. Prøv igjen senere.' },
  form: { incomplete: 'Svar på de markerte spørsmålene før du sender inn.', requiredOne: 'Velg ett svar på dette spørsmålet.', requiredMany: 'Velg minst ett svar på dette spørsmålet.', submitError: 'Kunne ikke sende inn svaret.', reload: 'Last inn undersøkelsen på nytt', received: 'Svar mottatt', thanks: 'Takk for at du svarte.', success: 'Besvarelsen er lagret. Turufjell Vel kan bruke de samlede svarene som grunnlag for det videre arbeidet.', progress: '{answered} av {total} spørsmål besvart', yourResponse: 'Din besvarelse', answered: '{answered} av {total} besvart', website: 'Nettside', onePerProperty: 'Én besvarelse per tomt i denne undersøkelsen.', privacy: 'Svarene kobles til tomten i medlemsregisteret og lagres med tidspunkt for innsending.', submitting: 'Sender inn …', submit: 'Send inn svar', answers: { ja: 'Ja', nei: 'Nei', usikker: 'Usikker' } },
  email: { statuses: { pending: 'Venter', processing: 'Behandles', running: 'Sender', sent: 'Sendt', delivered: 'Levert', failed: 'Feilet', bounced: 'Avvist', suppressed: 'Undertrykt', completed: 'Fullført', cancelled: 'Avbrutt' }, loadError: 'Kunne ikke hente e-poststatus.', actionError: 'E-posthandlingen feilet.', testsAcceptedOne: '{count} testmail er akseptert av MailerSend.', testsAcceptedMany: '{count} testmailer er akseptert av MailerSend.', started: 'Utsendelsen er startet.', backgroundFailed: 'Utsendelsen er opprettet, men bakgrunnsjobben startet ikke. Kontroller Netlify-oppsettet.', loading: 'Henter e-poststatus …', eyebrow: 'E-post', title: 'Send undersøkelsen', privacy: 'Personlige lenker opprettes server-side og vises aldri her.', disabled: 'MailerSend er deaktivert eller mangler konfigurasjon.', recipientOverview: 'Mottakeroversikt', recipients: 'aktuelle mottakere', missingEmails: 'mangler gyldig e-post', testTitle: 'Send testmail', testHelp: 'Bruker samme mal og leverandør, men aldri en personlig medlemslenke. Oppgi én eller to adresser, adskilt med komma.', testRecipients: 'Testmottakere', testPlaceholder: 'navn@eksempel.no, navn2@eksempel.no', sending: 'Sender …', sendTest: 'Send testmail', bulkTitle: 'Masseutsendelse', bulkDisabled: 'Masseutsendelse er deaktivert inntil den blir aktivert eksplisitt.', recipientGroup: 'E-postgruppe', chooseGroup: 'Velg e-postgruppe', groupRecipients: '{count} mottakere', groupHelp: 'Velg gruppen som skal motta undersøkelsen. Ingen gruppe er valgt automatisk.', lockedGroup: 'Mottakergrunnlaget er låst til gruppen «{name}» for denne utsendelsen.', unknownGroup: 'ukjent eller slettet gruppe', noGroups: 'Opprett en e-postgruppe i medlemsregisteret før du starter utsendelsen.', recipientList: 'Mottakere i valgt gruppe', recipientCaption: 'Alle mottakere med gyldig hoved-e-post i valgt gruppe.', name: 'Navn', titleHolder: 'Hjemmelshaver', primaryEmail: 'Hoved-e-post', noRecipients: 'Gruppen har ingen ordinære medlemmer med gyldig hoved-e-post.', processed: '{count} % behandlet', progress: '{count} prosent behandlet', accepted: 'Akseptert', delivered: 'Levert', failed: 'Feilet', suppressed: 'Undertrykt', jobStopped: 'Jobben stoppet: {message}', restart: 'Start bakgrunnsjobben på nytt', sendNewLinks: 'Send nye sikre lenker', oneWillReceive: '{count} medlem vil motta denne undersøkelsen. En utsendelse kan ikke startes på nytt automatisk.', manyWillReceive: '{count} medlemmer vil motta denne undersøkelsen. En utsendelse kan ikke startes på nytt automatisk.', start: 'Start utsendelse', deliveryStatus: 'Leveringsstatus', deliveryCaption: 'Leveringsstatus per medlem', member: 'Medlem', domain: 'Domene', status: 'Status', note: 'Merknad', unknown: 'Ukjent', deliveryPages: 'Sider i leveringsstatus', previous: 'Forrige', next: 'Neste', page: 'Side {page} av {pages}', confirmEyebrow: 'Bekreft utsendelse', confirmTitle: 'Send til {count} medlemmer?', replaceDescription: 'Dette arkiverer den tidligere utsendelsen og sender nye engangslenker til alle aktuelle mottakere.', sendDescription: 'Dette starter en personlig e-post til hvert medlem i valgt e-postgruppe.' },
  admin: { answers: { ja: 'Ja', nei: 'Nei', usikker: 'Usikker' }, saveStates: { saved: 'Alle endringer lagret', dirty: 'Venter på automatisk lagring …', saving: 'Lagrer automatisk …', error: 'Automatisk lagring feilet' }, loadingResults: 'Henter resultater …', resultsError: 'Kunne ikke hente resultatene.', results: 'Resultater', responseOne: '{count} besvarelse', responseMany: '{count} besvarelser', resultsHelp: 'Resultatene kan vises og eksporteres både før og etter sluttdato.', export: 'Eksporter Excel', noAnswers: 'Ingen svar ennå', chartsHelp: 'Diagrammene fylles automatisk når den første besvarelsen er registrert.', questionVersion: 'Spørsmålsversjon {version}', answerCount: '{count} svar', question: 'Spørsmål {number}', distribution: 'Svarfordeling for spørsmål {number}', answered: 'besvart', percent: '{label}: {count} ({percent} prosent)', saveError: 'Kunne ikke lagre undersøkelsen.', created: 'Undersøkelsen er opprettet.', deleteError: 'Kunne ikke slette undersøkelsen.', deleteServerError: 'Kunne ikke kontakte serveren for å slette undersøkelsen.', new: 'Ny undersøkelse', surveys: 'Undersøkelser', tableCaption: 'Velg en undersøkelse for detaljer, resultater og innstillinger. Klikk på en kolonneoverskrift for å sortere.', survey: 'Undersøkelse', status: 'Status', endDate: 'Sluttdato', responses: 'Svar', version: 'Versjon', ended: 'Avsluttet', open: 'Åpen', closed: 'Lukket', manage: 'Administrer undersøkelse', create: 'Opprett undersøkelse', close: 'Lukk', details: 'Undersøkelsesdetaljer', settings: 'Innstillinger', mailing: 'Utsendelse', name: 'Navn', availableThrough: 'Undersøkelsen er tilgjengelig ut denne datoen.', openForResponses: 'Åpen for besvarelser', questions: 'Spørsmål', addQuestion: 'Legg til spørsmål', remove: 'Fjern', surveyId: 'Undersøkelses-ID', saving: 'Lagrer …', saveChanges: 'Lagre endringer', delete: 'Slett undersøkelse', mockReadonly: 'Mock-data kan ikke endres.', deleteTitle: 'Slette undersøkelsen «{title}»?', deleteDescription: 'Undersøkelsen, spørsmålene og eventuelle svar beholdes, men skjules og slutter å ta imot besvarelser.' },
};

surveys.admin.questionVersionLabel = 'Spørsmålsversjon';
surveys.email.backgroundUnavailable = 'Masseutsendelse kan bare startes fra den konfigurerte produksjonssiden.';
surveys.email.backgroundSecretMissing = 'Jobbhemmeligheten for masseutsendelse mangler eller er ugyldig i produksjon. Kontroller MAILERSEND_JOB_SECRET i Netlify og kjør en ny deploy.';
surveys.email.surveyUnavailable = 'Undersøkelsen må være åpen og svarfristen må ikke være utløpt før utsendelsen kan startes.';
Object.assign(surveys.admin, {
  attachments: 'Vedlegg', attachmentsHelp: 'Last opp bakgrunnsdokumenter som bare er tilgjengelige for administratorer og mottakere av denne undersøkelsen.',
  addAttachments: 'Legg til vedlegg', addAttachmentsHelp: 'Last opp ett eller flere dokumenter til undersøkelsen.', uploadingAttachments: 'Laster opp …',
  attachmentUploadError: 'Kunne ikke laste opp {name}.', attachmentUploadedOne: '{count} vedlegg er lastet opp.', attachmentUploadedMany: '{count} vedlegg er lastet opp.', attachmentPartialUpload: '{count} vedlegg ble lastet opp før feilen: ',
  attachmentDisplayName: 'Visningsnavn', attachmentRenameError: 'Kunne ikke lagre visningsnavnet.', attachmentNameSaved: 'Visningsnavnet er lagret.',
  openAttachment: 'Åpne', openAttachmentHelp: 'Åpne vedlegget i en ny fane.', saveAttachmentName: 'Lagre navn', saveAttachmentNameHelp: 'Lagre visningsnavnet for vedlegget.',
  removeAttachment: 'Fjern', removeAttachmentHelp: 'Fjern vedlegget fra undersøkelsen.', attachmentRemoveError: 'Kunne ikke fjerne vedlegget.', attachmentRemoved: 'Vedlegget er fjernet.',
  removeAttachmentTitle: 'Fjerne vedlegget «{title}»?', removeAttachmentDescription: 'Vedlegget blir ikke lenger tilgjengelig for mottakerne.', noAttachments: 'Ingen vedlegg er lastet opp.', file: 'Fil',
});

Object.assign(surveys.admin, {
  answerType: 'Svaralternativer', standardAnswers: 'Ja / Nei / Vet ikke', customAnswers: 'Egendefinerte alternativer',
  multipleAnswers: 'Tillat flere alternativer per spørsmål', optionNumber: 'Alternativ {number}', removeOption: 'Fjern alternativ {number}', addOption: 'Legg til alternativ',
  copy: 'Kopier til ny undersøkelse', copyTitle: 'Kopi av {title}', copiedDraft: 'Kopien er et nytt, stengt utkast uten mottakere eller svar.',
});
surveys.form.answers.usikker = 'Vet ikke';
surveys.admin.answers.usikker = 'Vet ikke';
export default surveys;
Object.assign(surveys.form, { selectMany: 'Velg ett eller flere alternativer.', selectOne: 'Velg ett alternativ.' });
Object.assign(surveys.email, {
  uniquePropertiesSent: 'Unike tomter',
  propertyNumber: 'H-nummer', missingPrimaryEmail: 'Hoved-e-post mangler',
  uniquePropertiesHelp: 'Hver tomt med sendt invitasjon telles én gang.',
  sentInvitations: 'Sendte invitasjoner',
  sentInvitationsHelp: 'Akseptert av MailerSend. Flere e-poster til samme tomt telles hver for seg.',
  mailOverview: 'E-postoversikt', mailFilters: 'Filtrer e-postoversikten',
  allMailTypes: 'Alle typer', allMailStatuses: 'Alle statuser', searchMailNotes: 'Søk i merknad eller feil-ID',
  mailVisibleCount: 'Viser {visible} av {count} treff', loadMoreMail: 'Vis flere',
  errorId: 'Feil-ID', openErrorLog: 'Åpne i Logg',
  failedMailHelp: 'Invitasjoner og kvitteringer med registrert feil.',
  notSent: 'Ikke sendt', notSentHelp: 'Sending stoppet eller kvittering utelatt etter avtale.',
  showAllMail: 'Vis alle', mailResultCount: '{count} oppføringer', mailType: 'Type',
  mailResultOne: '1 oppføring', mailRecipient: 'Mottaker / domene',
  mailKinds: { invitation: 'Invitasjon', receipt: 'Kvittering' },
  mailFilterCaptions: { all: 'Alle invitasjoner og kvitteringer', invitations: 'Sendte invitasjoner', properties: 'Én sendt invitasjon per tomt', failed: 'Feilede invitasjoner og kvitteringer', suppressed: 'Invitasjoner og kvitteringer som ikke ble sendt' },
  noMailMatches: 'Ingen e-poster i dette utvalget.',
  mailOverviewUnavailable: 'E-postoversikten er ikke tilgjengelig. Last inn siden på nytt etter at oppdateringen er publisert.',
  chooseGroupOrProperties: 'Velg en e-postgruppe eller legg til enkelttomter.', individualProperties: 'Enkelttomter', searchProperties: 'Søk på H-nummer, adresse eller navn',
  propertySearchError: 'Kunne ikke søke etter tomter.', removeProperty: 'Fjern {number} fra utvalget',
  includeOtherEmails: 'Ta også med øvrige registrerte e-postadresser', additionalEmail: 'Øvrig e-post',
  singleResponse: 'Begrenset til ett svar per tomt', singleResponseHelp: 'Første innsendte svar gjelder. Hoved-e-post får kvittering med tellende svar og hvem som sendte det.',
  independentResponseHelp: 'Hver invitert e-postadresse kan sende inn ett selvstendig, tellende svar. Hoved-e-post får kvittering.',
  policyLocked: 'Svarregelen er låst for denne undersøkelsen etter første utsendelse.', addRecipients: 'Legg til nye mottakere',
  appendDescription: 'Bare mottakere som ikke allerede er registrert for utsendelse i denne undersøkelsen legges til. Eksisterende svar og utsendelser beholdes.',
  recipientCaption: 'Mottakere i valgt gruppe og valgte enkelttomter. Øvrige e-postadresser tas bare med når dette er krysset av.', primaryEmail: 'Hoved-e-post', recipientEmail: 'Mottakeradresse',
  receipts: 'Kvitteringer til hoved-e-post', receiptCounts: 'Venter: {pending} · Sendt: {sent} · Feilet: {failed} · Undertrykt: {suppressed}',
  receiptIssuesCaption: 'Kvitteringer som ikke ble sendt', address: 'Adresse',
  receiptReasons: {
    ADMIN_IMPORT_NO_RECEIPT: 'Kvittering ble bevisst ikke sendt ved administrativ registrering, etter avtale.',
    UPSTREAM: 'Eldre sendefeil: detaljert årsak ble ikke lagret og kan ikke gjenopprettes fra denne loggen.',
    MAILERSEND_DAILY_QUOTA: 'MailerSends dagskvote var brukt opp.',
    MAILERSEND_RATE_LIMIT: 'MailerSend ba systemet redusere sendehastigheten.',
    RECIPIENT_SUPPRESSED: 'Sending stoppet fordi mottakeren står på en sperreliste, for eksempel etter retur, avmelding eller spamklage.',
    SUPPRESSED: 'MailerSend stoppet sendingen fordi mottakeren står på en sperreliste.',
    PRIMARY_EMAIL_CHANGED_OR_MISSING: 'Hoved-e-post manglet eller var endret før kvitteringen ble sendt.',
    UNCERTAIN_AFTER_INTERRUPTION: 'Jobben ble avbrutt mens leveringstilstanden var ukjent.',
    SEND_FAILED: 'Kvitteringen kunne ikke sendes.',
  },
  noNewRecipients: 'Alle valgte mottakere er allerede registrert for utsendelse. Ingen nye invitasjoner ble opprettet.',
  jobPaused: 'MailerSend har midlertidig begrenset sendingen. Utsendelsen fortsetter automatisk etter {time}.',
});
Object.assign(surveys.form, { onePerRecipient: 'Én selvstendig besvarelse per invitert e-postadresse.', notCounted: 'En annen mottaker har allerede sendt inn det tellende svaret for tomten. Ditt svar erstatter ikke dette. Hoved-e-post får en kvittering som oppsummerer begge innsendingene.' });
Object.assign(surveys.page, {
  previewEyebrow: 'Forhåndsvisning', previewTitle: 'Undersøkelsen kan ikke forhåndsvises',
  previewMessage: 'Dette er en testvisning av «{title}». Du kan prøve hele skjemaet uten at svar eller testinnsendinger lagres.',
  previewUnavailable: 'Forhåndsvisningslenken er ugyldig, utløpt eller gjelder en eldre versjon av spørsmålene. Send en ny testmail fra administrasjonen.',
});
Object.assign(surveys.form, {
  previewPrivacy: 'Forhåndsvisning – ingenting lagres.',
  previewPrivacyHelp: 'Knappen nedenfor viser kvitteringssiden lokalt i nettleseren og sender ingen svar til serveren.',
  previewSubmit: 'Test innsending', previewReceived: 'Test fullført', previewThanks: 'Slik ser kvitteringen ut.',
  previewSuccess: 'Dette var bare en forhåndsvisning. Ingen svar eller testinnsending er lagret.', previewAgain: 'Prøv skjemaet på nytt',
});
surveys.email.testHelp = 'Sender samme e-postmal med en forhåndsvisningslenke som er gyldig i 24 timer. Ingen personlig medlemslenke opprettes, og valg eller testinnsendinger lagres ikke. Oppgi én eller to adresser, adskilt med komma.';

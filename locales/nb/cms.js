const cms = { common: { page: 'Side', pages: 'Sider', title: 'Tittel', slug: 'URL', intro: 'Ingress', content: 'Innhold', category: 'Kategori', draft: 'Utkast', published: 'Publisert', preview: 'Forhåndsvisning', attachment: 'Vedlegg', image: 'Bilde', file: 'Fil', documents: 'Dokumenter' }, notFound: { metadata: 'Siden finnes ikke | Turufjell Vel', title: 'Siden finnes ikke', description: 'Siden kan være flyttet, avpublisert eller slettet.', home: 'Til forsiden' }, richEditor: { mainText: 'Hovedtekst', formatting: 'Formatering', paragraph: 'Avsnitt', heading2: 'Overskrift 2', heading3: 'Overskrift 3', bold: 'Fet', italic: 'Kursiv', bulletList: 'Punktliste', orderedList: 'Nummerert liste', quote: 'Sitat', undo: 'Angre', redo: 'Gjør om', linkAddress: 'Lenkeadresse', invalidLink: 'Bruk en gyldig https-, http-, mailto- eller intern lenke.', selectText: 'Marker teksten som skal bli en lenke først.', linkAdded: 'Lenken er lagt til.', addLink: 'Legg til lenke', removeLink: 'Fjern lenke', help: 'Enkel formatering, uten egendefinerte skrifter, farger eller HTML. Maks 100 000 teksttegn.' } };
cms.preview = { title: 'Forhåndsvisning', published: 'Publisert', draft: 'Utkast', back: 'Tilbake til CMS' };
cms.common.richTextError = 'Artikkelteksten kunne ikke vises.';
cms.categories = { 'Nyttig info': 'Nyttig info', Administrativt: 'Administrativt', Årsmøter: 'Årsmøter', Nyheter: 'Nyheter' };
cms.admin = { saveStates: { saved: 'Alle endringer lagret', dirty: 'Venter på automatisk lagring …', saving: 'Lagrer automatisk …', error: 'Automatisk lagring feilet' }, loadError: 'Kunne ikke hente siden.', saveError: 'Kunne ikke lagre siden.', savedPublished: 'Siden er lagret og publisert.', draftCreated: 'Utkastet er opprettet.', validTitle: 'Fyll ut en gyldig tittel og URL før du legger til filer.', draftUploadError: 'Kunne ikke opprette utkastet før filopplasting.', statusError: 'Kunne ikke endre status.', publishedNotice: 'Siden er publisert.', unpublishedNotice: 'Siden er avpublisert og lagret som utkast.', imageUploadError: 'Kunne ikke laste opp bildet.', imageUploaded: '{draft}Bildet er lastet opp. Husk alt-tekst og lagre siden.', draftPrefix: 'Utkastet ble opprettet. ', draftButPrefix: 'Utkastet ble opprettet, men ', attachmentUploadError: 'Kunne ikke laste opp {name}.', attachmentsUploaded: '{draft}{count} vedlegg lastet opp.', partialUpload: '{count} vedlegg ble lastet opp, men resten mislyktes. ', renameError: 'Kunne ikke endre navnet.', nameSaved: 'Visningsnavnet er lagret.', orderError: 'Kunne ikke endre rekkefølgen.', deletePageError: 'Kunne ikke slette siden.', pageDeleted: 'Siden er slettet.', removeImageError: 'Kunne ikke fjerne bildet.', imageRemoved: 'Bildet er fjernet.', removeAttachmentError: 'Kunne ikke fjerne vedlegget.', attachmentRemoved: 'Vedlegget er fjernet.', deletePageTitle: 'Slette «{title}»?', removeImageTitle: 'Fjerne hovedbildet?', removeAttachmentTitle: 'Fjerne «{title}»?', attachmentFallback: 'vedlegget', searchLabel: 'Søk på tittel', searchPlaceholder: 'Søk etter en side …', search: 'Søk', reset: 'Nullstill', newPage: 'Ny side', storageWarning: 'Tekstinnhold kan opprettes, men bilde- og filopplasting krever at Neon Object Storage er satt opp.', loading: 'Henter side …', pages: 'Nettsider', tableCaption: 'Alle aktive nettsider. Bruk handlingene for å redigere, forhåndsvise eller endre publiseringsstatus.', title: 'Tittel', category: 'Kategori', status: 'Status', modified: 'Sist endret', published: 'Publisert', actions: 'Handlinger', draft: 'Utkast', edit: 'Rediger', preview: 'Forhåndsvis', unpublish: 'Avpubliser', publish: 'Publiser', delete: 'Slett', noneFound: 'Ingen sider funnet', noneHelp: 'Opprett den første informasjonssiden, eller prøv et annet søk.', editPage: 'Rediger nettside', website: 'Nettside', createPage: 'Opprett side', close: 'Lukk', deletePageDescription: 'Siden skjules umiddelbart, men innhold og filer beholdes i databasen.', removeDescription: 'Elementet fjernes fra siden, men beholdes som slettet i systemet.', deletePage: 'Slett side', remove: 'Fjern', pageContent: 'Sideinnhold', characters: '{count}/{max} tegn', slugHelp: 'Foreslås fra tittelen. Bruk små bokstaver, tall og bindestrek.', intro: 'Ingress', introHelp: '{count}/500 tegn. Kort introduksjon anbefales.', optional: 'Valgfritt', mainImage: 'Hovedbilde', changeImage: 'Bytt bilde', removeImage: 'Fjern bilde', uploadImage: 'Last opp hovedbilde', imageFormats: 'JPG, PNG eller WebP · maks 10 MB', uploadPrerequisite: 'Fyll ut tittel og URL. Første opplasting oppretter automatisk et utkast.', altText: 'Alt-tekst', altHelp: 'Beskriv motivet kort for brukere som ikke kan se bildet. Anbefales når bildet formidler informasjon.', imageCaption: 'Bildetekst', attachments: 'Vedlegg', addFiles: 'Legg til filer', displayName: 'Visningsnavn', saveName: 'Lagre navn', moveUp: 'Flytt {title} opp', up: 'Opp', moveDown: 'Flytt {title} ned', down: 'Ned', noAttachments: 'Ingen vedlegg er lagt til.', created: 'Opprettet', saving: 'Lagrer …', saveDraft: 'Lagre utkast', file: 'Fil' };
cms.admin.categories = cms.categories;
export default cms;
Object.assign(cms.admin, { copy: 'Kopier til ny artikkel', copied: 'Artikkelen er kopiert til et upublisert utkast med egne filer. Kontroller tittel og URL før publisering.' });

Object.assign(cms.admin, {
  "loadingEditor": "Laster tekstverktøy …",
  "historyError": "Kunne ikke hente historikken.",
  "fixErrors": "Rett feilene før publisering.",
  "justifyWarnings": "Begrunn hvorfor advarslene kan overstyres (minst 10 tegn).",
  "publishing": "Publiserer …",
  "savedAt": "Lagret {time}.",
  "statusChanged": "Status er endret.",
  "saveBeforeUpload": "Lagre siden før filopplasting.",
  "uploadStates": {
    "uploading": "Laster opp",
    "done": "Ferdig",
    "failed": "Feilet"
  },
  "reused": "Filen er gjenbrukt på siden.",
  "removeFileConfirm": "Fjerne «{title}»? Filen beholdes i versjonshistorikken.",
  "restoreConfirm": "Gjenopprette revisjon {revision}? Dagens innhold beholdes i historikken.",
  "revisionRestored": "Revisjon {revision} er gjenopprettet som en ny revisjon.",
  "untitled": "Uten tittel",
  "unsaved": "Ulagrede endringer",
  "backToList": "Tilbake til listen",
  "conflictTitle": "Nyere versjon finnes",
  "conflictHelp": "En annen fane eller redaktør har lagret siden. Velg hvilken versjon du vil arbeide videre med.",
  "loadServerVersion": "Last inn serverversjonen",
  "copyDraft": "Kopier mitt utkast",
  "working": "Arbeider …",
  "content": "Innhold",
  "mediaTitle": "Bilde og dokumenter",
  "chooseMedia": "Velg fra mediebibliotek",
  "decorative": "Bildet er kun dekorativt",
  "retry": "Prøv igjen",
  "visibility": "Lenke og synlighet",
  "slug": "URL",
  "quality": "Publisering og kvalitet",
  "error": "Feil",
  "warning": "Advarsel",
  "overrideReason": "Begrunnelse for å overstyre advarsler",
  "stillPublished": "Den offentlige siden viser fortsatt sist publiserte revisjon.",
  "revision": "Revisjon {revision}",
  "history": "Versjonshistorikk",
  "restore": "Gjenopprett",
  "mediaLibrary": "Mediebibliotek",
  "mediaHelp": "Filer er private og kopieres til denne siden ved gjenbruk. Sletting fra en side beholder filen i historikken.",
  "type": "Type",
  "all": "Alle",
  "images": "Bilder",
  "documents": "Dokumenter",
  "since": "Fra dato",
  "filter": "Filtrer",
  "revisionUses": "{count} revisjoner",
  "use": "Bruk",
  "archivedNotice": "Siden er arkivert og kan gjenopprettes.",
  "restoredNotice": "Siden er gjenopprettet.",
  "active": "Aktive",
  "drafts": "Utkast",
  "publishedPages": "Publiserte",
  "archivedPages": "Arkiverte",
  "sort": "Sortering",
  "oldestModified": "Eldst endret",
  "titleAsc": "Tittel A–Å",
  "titleDesc": "Tittel Å–A",
  "unpublishedChanges": "upubliserte endringer",
  "archived": "Arkivert",
  "archive": "Arkiver",
  "restorePageConfirm": "Gjenopprett «{title}»?",
  "archivePageConfirm": "Arkiver «{title}»?",
  "restorePageHelp": "Siden legges tilbake som utkast.",
  "archivePageHelp": "Siden forsvinner offentlig, men innhold, filer og historikk beholdes.",
  "openError": "Kunne ikke åpne redigeringen",
  "reloadHelp": "Prøv å laste siden på nytt. Ingen endringer er gjort.",
  "findings": {
    "missingTitle": "Tittel mangler.",
    "longTitle": "Tittelen er lang ({count} tegn).",
    "missingIntro": "Ingress mangler.",
    "missingImageAlt": "Bildet trenger alt-tekst eller må markeres som dekorativt.",
    "weakImageAlt": "Alt-teksten må beskrive motivet mer presist.",
    "missingDocumentTitle": "Et dokument mangler visningsnavn.",
    "invalidRichText": "Hovedteksten inneholder innhold som ikke støttes.",
    "headingJump": "Overskriftsnivåene hopper over et nivå.",
    "emptyLink": "En lenke mangler adresse.",
    "genericLink": "Bruk en beskrivende lenketekst i stedet for «klikk her/les mer».",
    "emptyBody": "Hovedtekst mangler."
  }
});
Object.assign(cms.preview, {
  "width": "Forhåndsvisningsbredde",
  "mobile": "Mobil",
  "tablet": "Nettbrett",
  "desktop": "Datamaskin",
  "revision": "Revisjon {revision}"
});
cms.richEditor.characters = "{count}/100 000 tegn.";

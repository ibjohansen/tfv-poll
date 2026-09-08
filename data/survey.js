// Opaque identifier included in the member link. It is not an authorization
// secret; the member token remains the access credential.
export const surveyId = "616fd7e9e244b6f4947eb1822dbd01ad";
// Økes når spørsmålene endres. Versjonen lagres med hvert svar.
export const surveyVersion = 1;
// Testundersøkelsen er tilgjengelig ut denne datoen (norsk tid).
export const surveyEndsOn = "2099-12-31";
// Korte, nøytrale query-navn holder medlemslenken mindre selvforklarende.
export const surveyLinkParameters = { member: "klm", survey: "xyz" };

export const surveyDocuments = [
  // Eksempel når dere har lagt en fil i public/survey/dokumenter:
  // {
  //   title: "Informasjon om alpinanlegg på Kristnatten",
  //   description: "Bakgrunnsdokument som er relevant før du svarer.",
  //   href: "/survey/dokumenter/kristnatten-informasjon.pdf",
  //   meta: "PDF",
  // },
];

export const surveyQuestions = [
  {
    id: "q1",
    number: 1,
    text: "Var lovnad om alpinanlegg på Kristnatten avgjørende for kjøp av tomt/hytte på Turufjell?",
  },
  {
    id: "q2",
    number: 2,
    text: "Mener du at du er blitt ført bak lyset/lurt i kjøpsprosessen, enten av markedsføring eller lovnader fra Turufjell eller representanter for Turufjell?",
  },
  {
    id: "q3",
    number: 3,
    text: "Ønsker du at vel-foreningen skal forfølge et eventuelt løftebrudd på vegne av medlemmene?",
  },
  {
    id: "q4",
    number: 4,
    text: "Ønsker du å bidra økonomisk til en slik prosess?",
  },
];

export const answerOptions = [
  { value: "ja", label: "Ja" },
  { value: "nei", label: "Nei" },
  { value: "usikker", label: "Usikker" },
];

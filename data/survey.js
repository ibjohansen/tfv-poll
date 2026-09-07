export const surveyDocuments = [
  // Eksempel når dere har lagt en fil i public/dokumenter:
  // {
  //   title: "Informasjon om alpinanlegg på Kristnatten",
  //   description: "Bakgrunnsdokument som er relevant før du svarer.",
  //   href: "/dokumenter/kristnatten-informasjon.pdf",
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

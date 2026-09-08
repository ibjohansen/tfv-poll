import ExcelJS from 'exceljs';

export const surveyAnswerOptions = [
  { value: 'ja', label: 'Ja' },
  { value: 'nei', label: 'Nei' },
  { value: 'usikker', label: 'Usikker' },
];

const allowedAnswers = new Set(surveyAnswerOptions.map(({ value }) => value));

function normalizedQuestions(value, fallback = []) {
  const questions = Array.isArray(value) && value.length ? value : fallback;
  if (!Array.isArray(questions)) return [];
  return questions
    .filter((question) => question && typeof question.id === 'string' && typeof question.text === 'string')
    .map((question, index) => ({
      id: question.id,
      number: Number.isInteger(question.number) ? question.number : index + 1,
      text: question.text,
    }));
}

function percentage(count, total) {
  return total ? Math.round((count / total) * 1000) / 10 : 0;
}

export function summarizeSurveyResponses(survey, responses) {
  const versions = new Map();

  for (const response of responses) {
    const versionNumber = Number(response.question_version);
    const version = Number.isInteger(versionNumber) && versionNumber >= 0 ? versionNumber : 0;
    const questions = normalizedQuestions(response.questions, survey.questions);
    let resultVersion = versions.get(version);
    if (!resultVersion) {
      resultVersion = { version, response_count: 0, questions: new Map() };
      versions.set(version, resultVersion);
    }
    resultVersion.response_count += 1;

    for (const question of questions) {
      let resultQuestion = resultVersion.questions.get(question.id);
      if (!resultQuestion) {
        resultQuestion = {
          ...question,
          counts: { ja: 0, nei: 0, usikker: 0 },
        };
        resultVersion.questions.set(question.id, resultQuestion);
      }
      const answer = response.answers?.[question.id];
      if (allowedAnswers.has(answer)) resultQuestion.counts[answer] += 1;
    }
  }

  if (!versions.size) {
    const version = Number.isInteger(Number(survey.question_version)) ? Number(survey.question_version) : 1;
    versions.set(version, {
      version,
      response_count: 0,
      questions: new Map(normalizedQuestions(survey.questions).map((question) => [question.id, {
        ...question,
        counts: { ja: 0, nei: 0, usikker: 0 },
      }])),
    });
  }

  const normalizedVersions = [...versions.values()]
    .sort((a, b) => b.version - a.version)
    .map((resultVersion) => ({
      version: resultVersion.version,
      response_count: resultVersion.response_count,
      questions: [...resultVersion.questions.values()]
        .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id, 'nb'))
        .map((question) => {
          const answered_count = Object.values(question.counts).reduce((sum, count) => sum + count, 0);
          return {
            ...question,
            answered_count,
            percentages: Object.fromEntries(surveyAnswerOptions.map(({ value }) => [value, percentage(question.counts[value], answered_count)])),
          };
        }),
    }));

  return {
    survey: {
      id: survey.id,
      title: survey.title,
      is_open: survey.is_open,
      ends_on: survey.ends_on,
      has_ended: survey.has_ended,
    },
    response_count: responses.length,
    versions: normalizedVersions,
  };
}

function answerLabel(value) {
  return surveyAnswerOptions.find((option) => option.value === value)?.label || 'Ikke besvart';
}

function dateValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date;
}

function styleHeader(row) {
  row.height = 28;
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18181B' } };
  row.alignment = { vertical: 'middle', wrapText: true };
}

export async function buildSurveyResultsWorkbook({ survey, responses }) {
  const summary = summarizeSurveyResponses(survey, responses);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Medlemsservice';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Oppsummering', { views: [{ state: 'frozen', ySplit: 6 }] });
  summarySheet.addRow(['Undersøkelse', survey.title]);
  summarySheet.addRow(['Undersøkelses-ID', survey.id]);
  summarySheet.addRow(['Sluttdato', survey.ends_on || '']);
  summarySheet.addRow(['Antall besvarelser', summary.response_count]);
  summarySheet.addRow([]);
  summarySheet.addRow(['Versjon', 'Nr.', 'Spørsmål', 'Ja', 'Nei', 'Usikker', 'Besvart']);
  styleHeader(summarySheet.getRow(6));
  summarySheet.columns = [
    { width: 12 }, { width: 8 }, { width: 75 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 },
  ];
  for (const version of summary.versions) {
    for (const question of version.questions) {
      summarySheet.addRow([
        version.version,
        question.number,
        question.text,
        `${question.counts.ja} (${question.percentages.ja.toLocaleString('nb-NO')} %)`,
        `${question.counts.nei} (${question.percentages.nei.toLocaleString('nb-NO')} %)`,
        `${question.counts.usikker} (${question.percentages.usikker.toLocaleString('nb-NO')} %)`,
        question.answered_count,
      ]);
    }
  }
  summarySheet.eachRow((row, rowNumber) => {
    if (rowNumber > 6) row.alignment = { vertical: 'top', wrapText: true };
  });
  summarySheet.autoFilter = { from: 'A6', to: 'G6' };

  const responsesSheet = workbook.addWorksheet('Besvarelser', { views: [{ state: 'frozen', ySplit: 1 }] });
  responsesSheet.columns = [
    { header: 'Besvarelse', key: 'response', width: 14 },
    { header: 'Mottatt', key: 'created_at', width: 23 },
    { header: 'Spørsmålsversjon', key: 'question_version', width: 20 },
    { header: 'Nr.', key: 'question_number', width: 8 },
    { header: 'Spørsmål', key: 'question', width: 75 },
    { header: 'Svar', key: 'answer', width: 18 },
  ];
  styleHeader(responsesSheet.getRow(1));
  responses.forEach((response, responseIndex) => {
    const questions = normalizedQuestions(response.questions, survey.questions);
    for (const question of questions) {
      responsesSheet.addRow({
        response: responseIndex + 1,
        created_at: dateValue(response.created_at),
        question_version: response.question_version,
        question_number: question.number,
        question: question.text,
        answer: answerLabel(response.answers?.[question.id]),
      });
    }
  });
  responsesSheet.getColumn('created_at').numFmt = 'dd.mm.yyyy hh:mm';
  responsesSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
  responsesSheet.autoFilter = { from: 'A1', to: 'F1' };

  return workbook.xlsx.writeBuffer();
}

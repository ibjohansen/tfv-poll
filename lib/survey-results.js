import ExcelJS from 'exceljs';
import { defaultAnswerOptions, questionOptions, surveyAnswerLabel } from './survey-questions.js';

export const surveyAnswerOptions = defaultAnswerOptions;

function normalizedQuestions(value, fallback = []) {
  const questions = Array.isArray(value) && value.length ? value : fallback;
  if (!Array.isArray(questions)) return [];
  return questions
    .filter((question) => question && typeof question.id === 'string' && typeof question.text === 'string')
    .map((question, index) => ({
      id: question.id,
      number: Number.isInteger(question.number) ? question.number : index + 1,
      text: question.text,
      ...(question.options ? { options: question.options } : {}),
      ...(question.multiple ? { multiple: true } : {}),
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
          counts: Object.fromEntries(questionOptions(question).map(({ value }) => [value, 0])), answered_count: 0,
        };
        resultVersion.questions.set(question.id, resultQuestion);
      }
      const answer = response.answers?.[question.id];
      const allowed = new Set(questionOptions(question).map(({ value }) => value));
      const values = [...new Set(Array.isArray(answer) ? answer : [answer])].filter((value) => allowed.has(value));
      if (values.length) resultQuestion.answered_count++;
      for (const value of values) resultQuestion.counts[value]++;
    }
  }

  if (!versions.size) {
    const version = Number.isInteger(Number(survey.question_version)) ? Number(survey.question_version) : 1;
    versions.set(version, {
      version,
      response_count: 0,
      questions: new Map(normalizedQuestions(survey.questions).map((question) => [question.id, {
        ...question,
        counts: Object.fromEntries(questionOptions(question).map(({ value }) => [value, 0])), answered_count: 0,
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
          const answered_count = question.answered_count;
          return {
            ...question,
            answered_count,
            percentages: Object.fromEntries(questionOptions(question).map(({ value }) => [value, percentage(question.counts[value], answered_count)])),
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

export async function buildSurveyResultsWorkbook({ survey, responses, hamletName = 'Alle grender' }) {
  const summary = summarizeSurveyResponses(survey, responses);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Medlemsservice';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Oppsummering', { views: [{ state: 'frozen', ySplit: 6 }] });
  summarySheet.addRow(['Undersøkelse', survey.title]);
  summarySheet.addRow(['Undersøkelses-ID', survey.id]);
  summarySheet.addRow(['Sluttdato', survey.ends_on || '']);
  summarySheet.addRow(['Antall besvarelser', summary.response_count]);
  summarySheet.addRow(['Grend (nåværende tilknytning)', hamletName]);
  summarySheet.addRow(['Versjon', 'Nr.', 'Spørsmål', 'Svaralternativ', 'Antall', 'Prosent av besvarelser', 'Besvart']);
  styleHeader(summarySheet.getRow(6));
  summarySheet.columns = [
    { width: 12 }, { width: 8 }, { width: 75 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 },
  ];
  for (const version of summary.versions) {
    for (const question of version.questions) {
      for (const option of questionOptions(question)) summarySheet.addRow([
        version.version, question.number, question.text, option.label,
        question.counts[option.value], question.percentages[option.value], question.answered_count,
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
        answer: surveyAnswerLabel(question, response.answers?.[question.id]),
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

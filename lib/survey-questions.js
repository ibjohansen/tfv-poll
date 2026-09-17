// Shared by editor, public form, validation, receipts and result exports.
export const defaultAnswerOptions = [
  { value: 'ja', label: 'Ja' }, { value: 'nei', label: 'Nei' }, { value: 'usikker', label: 'Vet ikke' },
];

export function questionOptions(question) {
  return Array.isArray(question?.options) ? question.options : defaultAnswerOptions;
}

export function normalizeSurveyQuestions(questions) {
  if (!Array.isArray(questions) || !questions.length || questions.length > 30) throw new Error('Invalid survey');
  const ids = new Set();
  return questions.map((question, index) => {
    if (!question || typeof question.text !== 'string' || !question.text.trim() || question.text.trim().length > 1000) throw new Error('Invalid survey');
    let id = /^q\d{1,3}$/.test(question.id || '') ? question.id : `q${index + 1}`;
    let next = index + 1;
    while (ids.has(id)) id = `q${next++}`;
    ids.add(id);
    const result = { id, number: index + 1, text: question.text.trim() };
    if (question.multiple !== undefined && typeof question.multiple !== 'boolean') throw new Error('Invalid survey');
    if (question.multiple) result.multiple = true;
    if (question.options !== undefined) {
      if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 20) throw new Error('Invalid survey');
      const values = new Set(), labels = new Set();
      result.options = question.options.map((option) => {
        if (!option || !/^[a-z][a-z0-9_-]{0,39}$/.test(option.value || '') || typeof option.label !== 'string'
          || !option.label.trim() || option.label.trim().length > 200 || values.has(option.value) || labels.has(option.label.trim().toLocaleLowerCase('nb'))) throw new Error('Invalid survey');
        values.add(option.value); labels.add(option.label.trim().toLocaleLowerCase('nb'));
        return { value: option.value, label: option.label.trim() };
      });
    }
    return result;
  });
}

export function hasValidSurveyAnswers(answers, questions) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).length !== questions.length) return false;
  return questions.every((question) => {
    const answer = answers[question.id];
    const allowed = new Set(questionOptions(question).map(({ value }) => value));
    if (question.multiple) return Array.isArray(answer) && answer.length > 0 && answer.length <= allowed.size
      && new Set(answer).size === answer.length && answer.every((value) => allowed.has(value));
    return typeof answer === 'string' && allowed.has(answer);
  });
}

export function surveyAnswerLabel(question, answer) {
  const values = Array.isArray(answer) ? answer : [answer];
  return values.map((value) => questionOptions(question).find((option) => option.value === value)?.label).filter(Boolean).join(', ') || 'Ikke besvart';
}

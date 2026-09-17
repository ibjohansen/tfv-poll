'use client';

import Select from '@/components/Select';
import { useI18n } from '@/components/LocaleProvider';

export default function SurveyQuestionOptions({ question, onChange }) {
  const { t } = useI18n('surveys.admin');
  return <div className="survey-question-options">
    <label>{t('answerType')}<Select value={question.options ? 'custom' : 'standard'} onChange={(event) => {
      const next = { ...question };
      if (event.target.value === 'custom') next.options = [{ value: 'o1', label: '' }, { value: 'o2', label: '' }];
      else delete next.options;
      onChange(next);
    }}><option value="standard">{t('standardAnswers')}</option><option value="custom">{t('customAnswers')}</option></Select></label>
    <label className="admin-checkbox"><input type="checkbox" checked={Boolean(question.multiple)} onChange={(event) => onChange({ ...question, multiple: event.target.checked })} />{t('multipleAnswers')}</label>
    {question.options?.map((option, index) => <div className="survey-option-editor" key={option.value}>
      <label>{t('optionNumber', { number: index + 1 })}<input value={option.label} maxLength={200} required onChange={(event) => onChange({ ...question, options: question.options.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label>
      <button type="button" className="admin-button" disabled={question.options.length <= 2} aria-label={t('removeOption', { number: index + 1 })} onClick={() => onChange({ ...question, options: question.options.filter((_, i) => i !== index) })}>{t('remove')}</button>
    </div>)}
    {question.options && <button type="button" className="admin-button" disabled={question.options.length >= 20} onClick={() => {
      let id = 1; while (question.options.some((option) => option.value === `o${id}`)) id++;
      onChange({ ...question, options: [...question.options, { value: `o${id}`, label: '' }] });
    }}>{t('addOption')}</button>}
  </div>;
}

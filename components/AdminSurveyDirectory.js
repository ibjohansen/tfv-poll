'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import SurveyEmailPanel from '@/components/SurveyEmailPanel';
import SurveyAttachments from '@/components/SurveyAttachments';
import SurveyQuestionOptions from '@/components/SurveyQuestionOptions';
import { normalizeSurveyQuestions, questionOptions } from '@/lib/survey-questions';
import { useI18n } from '@/components/LocaleProvider';

const blankQuestion = (number) => ({ id: `q${number}`, number, text: '' });
const chartColors = ['#15803d', '#b91c1c', '#a16207', '#2563eb', '#7c3aed', '#be185d', '#0e7490'];

function normalizeQuestions(questions) {
  return questions.map((question, index) => ({ ...question, number: index + 1 }));
}

function surveyPayload(title, isOpen, endsOn, questions) {
  return { title, isOpen, endsOn, questions: normalizeQuestions(questions) };
}

const surveyKey = (payload) => JSON.stringify(payload);

function nextQuestion(questions) {
  const ids = new Set(questions.map(({ id }) => id));
  let number = 1;
  while (ids.has(`q${number}`)) number += 1;
  return blankQuestion(number);
}

function formatEndDate(value, locale) {
  if (typeof value !== 'string') return '—';
  return new Intl.DateTimeFormat(locale, {dateStyle: 'short', timeZone: 'Europe/Oslo'}).format(new Date(`${value}T12:00:00Z`));
}

function SurveyResults({ data, state, surveyId, t, formatLocale }) {
  if (state === 'loading') return <p className="survey-results-status" role="status">{t('loadingResults')}</p>;
  if (state === 'error') return <p className="form-error" role="alert">{t('resultsError')}</p>;
  if (!data) return null;

  return (
    <section className="survey-results" aria-labelledby="survey-results-heading">
      <div className="survey-results-summary">
        <div>
          <p className="eyebrow">{t('results')}</p>
          <h3 id="survey-results-heading">{t(data.response_count === 1 ? 'responseOne' : 'responseMany', {count: data.response_count})}</h3>
          <p>{t('resultsHelp')}</p>
        </div>
        <a className="admin-button survey-results-export" href={`/api/admin/surveys/${surveyId}/results/export`}>{t('export')}</a>
      </div>

      {data.response_count === 0 ? (
        <div className="survey-results-empty">
          <strong>{t('noAnswers')}</strong>
          <p>{t('chartsHelp')}</p>
        </div>
      ) : data.versions.map((version) => (
        <section className="survey-result-version" key={version.version} aria-labelledby={`result-version-${version.version}`}>
          <div className="survey-result-version-heading">
            <h4 id={`result-version-${version.version}`}>{t('questionVersion', {version: version.version})}</h4>
            <span>{t('answerCount', {count: version.response_count})}</span>
          </div>
          <div className="survey-result-grid">
            {version.questions.map((question) => {
              const answerOptions = questionOptions(question).map((option, index) => ({ ...option, color: chartColors[index % chartColors.length] }));
              let end = 0;
              const gradient = answerOptions.map(({ value, color }) => { const start = end; end += question.percentages[value]; return `${color} ${start}% ${end}%`; }).join(', ');
              const chartLabel = answerOptions
                .map(({ value, label }) => t('percent', {label: question.options ? label : t(`answers.${value}`), count: question.counts[value], percent: question.percentages[value].toLocaleString(formatLocale)}))
                .join(', ');
              return (
                <article className="survey-result-card" key={question.id}>
                  <div className="survey-result-question">
                    <span>{t('question', {number: question.number})}</span>
                    <h5>{question.text}</h5>
                  </div>
                  <div className="survey-result-visual">
                    {!question.multiple && <div
                      className={`survey-donut${question.answered_count ? '' : ' is-empty'}`}
                      style={question.answered_count ? { background: `conic-gradient(${gradient})` } : undefined}
                      role="img"
                      aria-label={chartLabel}
                    >
                      <span><strong>{question.answered_count}</strong><small>{t('answered')}</small></span>
                    </div>}
                    <ul className="survey-result-legend" aria-label={t('distribution', {number: question.number})}>
                      {answerOptions.map(({ value, color, label }) => (
                        <li key={value}>
                          <span className="survey-result-key"><i style={{ backgroundColor: color }} aria-hidden="true" />{question.options ? label : t(`answers.${value}`)}</span>
                          <strong>{question.counts[value]}</strong>
                          <small>{question.percentages[value].toLocaleString(formatLocale)} %</small>
                          {question.multiple && <meter min={0} max={100} value={question.percentages[value]} aria-label={label} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}

export default function AdminSurveyDirectory({ surveys, sort, direction, adminEmail }) {
  const { t, formatLocale } = useI18n('surveys.admin');
  const router = useRouter();
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('settings');
  const [title, setTitle] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [endsOn, setEndsOn] = useState('');
  const [questions, setQuestions] = useState([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [savedPayloadKey, setSavedPayloadKey] = useState('');
  const draftPayload = useMemo(() => surveyPayload(title, isOpen, endsOn, questions), [endsOn, isOpen, questions, title]);
  const draftKey = surveyKey(draftPayload);
  const displayedSaveState = saveState === 'saved' && draftKey !== savedPayloadKey ? 'dirty' : saveState;
  const latestDraftKey = useRef(draftKey);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [results, setResults] = useState(null);
  const [resultsState, setResultsState] = useState('idle');
  const [resultsReload, setResultsReload] = useState(0);
  const selectedId = selected && !selected.isNew ? selected.id : null;

  useEffect(() => {
    if (!selectedId) return undefined;
    const controller = new AbortController();
    fetch(`/api/admin/surveys/${selectedId}/results`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message || t('resultsError'));
        setResults(body.results);
        setResultsState('ready');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setResultsState('error');
      });
    return () => controller.abort();
  }, [selectedId, resultsReload, t]);

  function select(survey) {
    setSelected(survey);
    setActiveTab('settings');
    setResults(null);
    setResultsState('loading');
    setTitle(survey.title);
    setIsOpen(survey.is_open);
    setEndsOn(survey.ends_on || '');
    setQuestions(survey.questions || []);
    setSavedPayloadKey(surveyKey(surveyPayload(survey.title, survey.is_open, survey.ends_on || '', survey.questions || [])));
    setSaveState('saved');
    setMessage('');
  }

  function create() {
    setSelected({ isNew: true, is_open: true, question_version: 1, response_count: 0 });
    setActiveTab('settings');
    setResults(null);
    setResultsState('idle');
    setTitle('');
    setIsOpen(true);
    setEndsOn('');
    setQuestions([blankQuestion(1)]);
    setSavedPayloadKey('');
    setSaveState('idle');
    setMessage('');
  }

  const close = () => {
    setSelected(null);
    setResults(null);
    setResultsState('idle');
  };
  const sortHref = (column) => `/admin/surveys?${new URLSearchParams({ sort: column, dir: sort === column && direction === 'asc' ? 'desc' : 'asc' })}`;
  const sortLabel = (column, label) => `${label}${sort === column ? direction === 'asc' ? ' ↑' : ' ↓' : ''}`;
  const updateQuestion = (index, text) => setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, text } : question));
  const removeQuestion = (index) => setQuestions((current) => normalizeQuestions(current.filter((_, questionIndex) => questionIndex !== index)));
  const addQuestion = () => setQuestions((current) => [...current, nextQuestion(current)]);

  const persistSurvey = useCallback(async (payload, wasNew, surveyId) => {
    setSaving(true);
    setSaveState('saving');
    setMessage('');
    const endpoint = wasNew ? '/api/admin/surveys' : `/api/admin/surveys/${surveyId}`;
    try {
      const response = await fetch(endpoint, { method: wasNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('saveError'));
      const returnedPayload = surveyPayload(body.survey.title, body.survey.is_open, body.survey.ends_on || '', body.survey.questions || []);
      setSavedPayloadKey(surveyKey(returnedPayload));
      setSelected(body.survey);
      if (latestDraftKey.current === surveyKey(payload)) {
        setTitle(body.survey.title); setIsOpen(body.survey.is_open); setEndsOn(body.survey.ends_on); setQuestions(body.survey.questions);
        setSaveState('saved');
      } else setSaveState('dirty');
      setMessage(wasNew ? t('created') : '');
      setResults(null); setResultsState('loading'); setResultsReload((value) => value + 1); router.refresh();
    } catch (error) { setMessage(error.message || t('saveError')); setSaveState('error'); }
    finally { setSaving(false); }
  }, [router, t]);

  async function save(event) {
    event.preventDefault();
    await persistSurvey(draftPayload, selected.isNew, selected.id);
  }

  async function copy() {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/admin/surveys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'copy', sourceId: selected.id }), signal: AbortSignal.timeout(60000) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('saveError'));
      select(body.survey); setMessage(t('copiedDraft')); router.refresh();
    } catch (error) { setMessage(error.message || t('saveError')); }
    finally { setSaving(false); }
  }

  useEffect(() => { latestDraftKey.current = draftKey; }, [draftKey]);

  useEffect(() => {
    if (!selected || selected.isNew || selected.mock || saving || draftKey === savedPayloadKey) return undefined;
    if (!title.trim() || !endsOn || !questions.length || questions.some((question) => !question.text.trim())) return undefined;
    try { normalizeSurveyQuestions(questions); } catch { return undefined; }
    const timer = setTimeout(() => persistSurvey(draftPayload, false, selected.id), 900);
    return () => clearTimeout(timer);
  }, [draftKey, draftPayload, endsOn, isOpen, persistSurvey, questions, savedPayloadKey, saving, selected, title]);

  async function remove() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/surveys/${selected.id}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        setConfirmDelete(false);
        setMessage(body.message || t('deleteError'));
        return;
      }
      setConfirmDelete(false);
      close();
      router.refresh();
    } catch {
      setConfirmDelete(false);
      setMessage(t('deleteServerError'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="admin-toolbar"><button className="primary-button" type="button" onClick={create}>{t('new')}</button></div>
      <div className="admin-table-scroll" role="region" aria-label={t('surveys')} tabIndex={0}>
        <table className="admin-table">
          <caption>{t('tableCaption')}</caption>
          <thead><tr>
            <th scope="col"><Link className="admin-sort" href={sortHref('title')}>{sortLabel('title', t('survey'))}</Link></th>
            <th scope="col"><Link className="admin-sort" href={sortHref('is_open')}>{sortLabel('is_open', t('status'))}</Link></th>
            <th scope="col"><Link className="admin-sort" href={sortHref('ends_on')}>{sortLabel('ends_on', t('endDate'))}</Link></th>
            <th scope="col"><Link className="admin-sort" href={sortHref('response_count')}>{sortLabel('response_count', t('responses'))}</Link></th>
            <th scope="col"><Link className="admin-sort" href={sortHref('question_version')}>{sortLabel('question_version', t('version'))}</Link></th>
          </tr></thead>
          <tbody>{surveys.map((survey) => (
            <tr
              className="admin-clickable-row"
              key={survey.id}
              tabIndex={0}
              onClick={() => select(survey)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  select(survey);
                }
              }}
            >
              <th scope="row">{survey.title}</th>
              <td><span className={`status-pill ${survey.is_open && !survey.has_ended ? 'is-open' : 'is-closed'}`}>{survey.has_ended ? t('ended') : survey.is_open ? t('open') : t('closed')}</span></td>
              <td>{formatEndDate(survey.ends_on, formatLocale)}</td>
              <td>{survey.response_count}</td>
              <td>{survey.question_version}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <aside className={`admin-detail-panel survey-detail-panel${selected ? ' is-open' : ''}`} aria-hidden={!selected} aria-label={t('manage')}>
        <div className="admin-detail-header">
          <div><p className="eyebrow">{selected?.isNew ? t('new') : t('survey')}</p><h2>{selected?.isNew ? t('create') : selected?.title}</h2>{!selected?.isNew && <span className={`admin-save-status is-${displayedSaveState}`} role="status">{t(`saveStates.${displayedSaveState}`)}</span>}</div>
          <button className="admin-button" type="button" onClick={close} disabled={saving}>{t('close')}</button>
        </div>
        {selected && (
          <>
            {!selected.isNew && (
              <div className="survey-panel-tabs" role="tablist" aria-label={t('details')}>
                <button type="button" role="tab" aria-selected={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>{t('settings')}</button>
                <button type="button" role="tab" aria-selected={activeTab === 'results'} onClick={() => setActiveTab('results')}>{t('results')} <span>{selected.response_count}</span></button>
                <button type="button" role="tab" aria-selected={activeTab === 'email'} onClick={() => setActiveTab('email')}>{t('mailing')}</button>
              </div>
            )}
            {activeTab === 'email' && !selected.isNew ? (
              <SurveyEmailPanel surveyId={selected.id} adminEmail={adminEmail} />
            ) : activeTab === 'results' && !selected.isNew ? (
              <SurveyResults data={results} state={resultsState} surveyId={selected.id} t={t} formatLocale={formatLocale} />
            ) : (
              <form className="admin-detail-form" onSubmit={save}>
                <label>{t('name')}<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required /></label>
                <label>{t('endDate')}<input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} required /><span className="admin-field-note">{t('availableThrough')}</span></label>
                <label className="admin-checkbox"><input type="checkbox" checked={isOpen} onChange={(event) => setIsOpen(event.target.checked)} /> {t('openForResponses')}</label>
                <section className="admin-questions" aria-labelledby="admin-questions-heading">
                  <div className="admin-section-header"><h3 id="admin-questions-heading">{t('questions')}</h3><button className="admin-button" type="button" onClick={addQuestion}>{t('addQuestion')}</button></div>
                  {questions.map((question, index) => (
                    <div className="admin-question-editor" key={question.id}>
                      <label>{t('question', {number: index + 1})}<textarea value={question.text} onChange={(event) => updateQuestion(index, event.target.value)} rows={4} required /></label>
                      <SurveyQuestionOptions question={question} onChange={(next) => setQuestions((current) => current.map((item, i) => i === index ? next : item))} />
                      {questions.length > 1 && <button className="admin-remove" type="button" onClick={() => removeQuestion(index)}>{t('remove')}</button>}
                    </div>
                  ))}
                </section>
                {!selected.isNew && <SurveyAttachments key={selected.id} surveyId={selected.id} attachments={selected.attachments || []}
                  disabled={selected.mock} onChange={(attachments) => setSelected((current) => ({ ...current, attachments }))} />}
                {!selected.isNew && <dl className="admin-meta"><div><dt>{t('surveyId')}</dt><dd>{selected.id}</dd></div><div><dt>{t('responses')}</dt><dd>{selected.response_count}</dd></div><div><dt>{t('questionVersionLabel')}</dt><dd>{selected.question_version}</dd></div></dl>}
                {message && <p className={saveState === 'error' ? 'form-error' : 'admin-success'} role="status">{message}</p>}
                <button className="primary-button" type="submit" disabled={saving || selected.mock}>{saving ? t('saving') : selected.isNew ? t('create') : t('saveChanges')}</button>
                {!selected.isNew && <button className="admin-button" type="button" disabled={saving || selected.mock || displayedSaveState !== 'saved'} onClick={copy}>{t('copy')}</button>}
                {!selected.isNew && <button className="admin-delete" type="button" onClick={() => setConfirmDelete(true)} disabled={selected.mock}>{t('delete')}</button>}
                {selected.mock && <p className="privacy-subnote">{t('mockReadonly')}</p>}
              </form>
            )}
          </>
        )}
      </aside>
      <ConfirmDialog
        open={confirmDelete}
        title={t('deleteTitle', {title: selected?.title || ''})}
        description={t('deleteDescription')}
        confirmLabel={t('delete')}
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  );
}

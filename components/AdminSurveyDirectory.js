'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import SurveyEmailPanel from '@/components/SurveyEmailPanel';

const blankQuestion = (number) => ({ id: `q${number}`, number, text: '' });
const answerOptions = [
  { value: 'ja', label: 'Ja', color: '#15803d' },
  { value: 'nei', label: 'Nei', color: '#b91c1c' },
  { value: 'usikker', label: 'Usikker', color: '#a16207' },
];

function normalizeQuestions(questions) {
  return questions.map((question, index) => ({ ...question, number: index + 1 }));
}

function nextQuestion(questions) {
  const ids = new Set(questions.map(({ id }) => id));
  let number = 1;
  while (ids.has(`q${number}`)) number += 1;
  return blankQuestion(number);
}

function formatEndDate(value) {
  if (typeof value !== 'string') return '—';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : '—';
}

function SurveyResults({ data, state, surveyId }) {
  if (state === 'loading') return <p className="survey-results-status" role="status">Henter resultater …</p>;
  if (state === 'error') return <p className="form-error" role="alert">Kunne ikke hente resultatene.</p>;
  if (!data) return null;

  return (
    <section className="survey-results" aria-labelledby="survey-results-heading">
      <div className="survey-results-summary">
        <div>
          <p className="eyebrow">Resultater</p>
          <h3 id="survey-results-heading">{data.response_count} {data.response_count === 1 ? 'besvarelse' : 'besvarelser'}</h3>
          <p>Resultatene kan vises og eksporteres både før og etter sluttdato.</p>
        </div>
        <a className="admin-button survey-results-export" href={`/api/admin/surveys/${surveyId}/results/export`}>Eksporter Excel</a>
      </div>

      {data.response_count === 0 ? (
        <div className="survey-results-empty">
          <strong>Ingen svar ennå</strong>
          <p>Diagrammene fylles automatisk når den første besvarelsen er registrert.</p>
        </div>
      ) : data.versions.map((version) => (
        <section className="survey-result-version" key={version.version} aria-labelledby={`result-version-${version.version}`}>
          <div className="survey-result-version-heading">
            <h4 id={`result-version-${version.version}`}>Spørsmålsversjon {version.version}</h4>
            <span>{version.response_count} svar</span>
          </div>
          <div className="survey-result-grid">
            {version.questions.map((question) => {
              const jaEnd = question.percentages.ja;
              const neiEnd = jaEnd + question.percentages.nei;
              const chartLabel = answerOptions
                .map(({ value, label }) => `${label}: ${question.counts[value]} (${question.percentages[value].toLocaleString('nb-NO')} prosent)`)
                .join(', ');
              return (
                <article className="survey-result-card" key={question.id}>
                  <div className="survey-result-question">
                    <span>Spørsmål {question.number}</span>
                    <h5>{question.text}</h5>
                  </div>
                  <div className="survey-result-visual">
                    <div
                      className={`survey-donut${question.answered_count ? '' : ' is-empty'}`}
                      style={{ '--chart-ja': `${jaEnd}%`, '--chart-nei': `${neiEnd}%` }}
                      role="img"
                      aria-label={chartLabel}
                    >
                      <span><strong>{question.answered_count}</strong><small>besvart</small></span>
                    </div>
                    <ul className="survey-result-legend" aria-label={`Svarfordeling for spørsmål ${question.number}`}>
                      {answerOptions.map(({ value, label, color }) => (
                        <li key={value}>
                          <span className="survey-result-key"><i style={{ backgroundColor: color }} aria-hidden="true" />{label}</span>
                          <strong>{question.counts[value]}</strong>
                          <small>{question.percentages[value].toLocaleString('nb-NO')} %</small>
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
  const router = useRouter();
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('settings');
  const [title, setTitle] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [endsOn, setEndsOn] = useState('');
  const [questions, setQuestions] = useState([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
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
        if (!response.ok || !body.ok) throw new Error(body.message || 'Results unavailable');
        setResults(body.results);
        setResultsState('ready');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setResultsState('error');
      });
    return () => controller.abort();
  }, [selectedId, resultsReload]);

  function select(survey) {
    setSelected(survey);
    setActiveTab('settings');
    setResults(null);
    setResultsState('loading');
    setTitle(survey.title);
    setIsOpen(survey.is_open);
    setEndsOn(survey.ends_on || '');
    setQuestions(survey.questions || []);
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

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const wasNew = selected.isNew;
    const payload = { title, isOpen, endsOn, questions: normalizeQuestions(questions) };
    const endpoint = wasNew ? '/api/admin/surveys' : `/api/admin/surveys/${selected.id}`;
    const response = await fetch(endpoint, {
      method: wasNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok || !body.ok) {
      setMessage(body.message || 'Kunne ikke lagre undersøkelsen.');
      return;
    }
    setSelected(body.survey);
    setTitle(body.survey.title);
    setIsOpen(body.survey.is_open);
    setEndsOn(body.survey.ends_on);
    setQuestions(body.survey.questions);
    setMessage(wasNew ? 'Undersøkelsen er opprettet.' : 'Lagret.');
    setResults(null);
    setResultsState('loading');
    setResultsReload((value) => value + 1);
    router.refresh();
  }

  async function remove() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/surveys/${selected.id}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        setConfirmDelete(false);
        setMessage(body.message || 'Kunne ikke slette undersøkelsen.');
        return;
      }
      setConfirmDelete(false);
      close();
      router.refresh();
    } catch {
      setConfirmDelete(false);
      setMessage('Kunne ikke kontakte serveren for å slette undersøkelsen.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="admin-toolbar"><button className="primary-button" type="button" onClick={create}>Ny undersøkelse</button></div>
      <div className="admin-table-scroll" role="region" aria-label="Undersøkelser" tabIndex={0}>
        <table className="admin-table">
          <caption>Velg en undersøkelse for detaljer, resultater og innstillinger. Klikk på en kolonneoverskrift for å sortere.</caption>
          <thead><tr>
            <th scope="col"><Link className="admin-sort" href={sortHref('title')}>{sortLabel('title', 'Undersøkelse')}</Link></th>
            <th scope="col"><Link className="admin-sort" href={sortHref('is_open')}>{sortLabel('is_open', 'Status')}</Link></th>
            <th scope="col"><Link className="admin-sort" href={sortHref('ends_on')}>{sortLabel('ends_on', 'Sluttdato')}</Link></th>
            <th scope="col"><Link className="admin-sort" href={sortHref('response_count')}>{sortLabel('response_count', 'Svar')}</Link></th>
            <th scope="col"><Link className="admin-sort" href={sortHref('question_version')}>{sortLabel('question_version', 'Versjon')}</Link></th>
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
              <td><span className={`status-pill ${survey.is_open && !survey.has_ended ? 'is-open' : 'is-closed'}`}>{survey.has_ended ? 'Avsluttet' : survey.is_open ? 'Åpen' : 'Lukket'}</span></td>
              <td>{formatEndDate(survey.ends_on)}</td>
              <td>{survey.response_count}</td>
              <td>{survey.question_version}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <aside className={`admin-detail-panel survey-detail-panel${selected ? ' is-open' : ''}`} aria-hidden={!selected} aria-label="Administrer undersøkelse">
        <div className="admin-detail-header">
          <div><p className="eyebrow">{selected?.isNew ? 'Ny undersøkelse' : 'Undersøkelse'}</p><h2>{selected?.isNew ? 'Opprett undersøkelse' : selected?.title}</h2></div>
          <button className="admin-button" type="button" onClick={close}>Lukk</button>
        </div>
        {selected && (
          <>
            {!selected.isNew && (
              <div className="survey-panel-tabs" role="tablist" aria-label="Undersøkelsesdetaljer">
                <button type="button" role="tab" aria-selected={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>Innstillinger</button>
                <button type="button" role="tab" aria-selected={activeTab === 'results'} onClick={() => setActiveTab('results')}>Resultater <span>{selected.response_count}</span></button>
                <button type="button" role="tab" aria-selected={activeTab === 'email'} onClick={() => setActiveTab('email')}>Utsendelse</button>
              </div>
            )}
            {activeTab === 'email' && !selected.isNew ? (
              <SurveyEmailPanel surveyId={selected.id} adminEmail={adminEmail} />
            ) : activeTab === 'results' && !selected.isNew ? (
              <SurveyResults data={results} state={resultsState} surveyId={selected.id} />
            ) : (
              <form className="admin-detail-form" onSubmit={save}>
                <label>Navn<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required /></label>
                <label>Sluttdato<input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} required /><span className="admin-field-note">Undersøkelsen er tilgjengelig ut denne datoen.</span></label>
                <label className="admin-checkbox"><input type="checkbox" checked={isOpen} onChange={(event) => setIsOpen(event.target.checked)} /> Åpen for besvarelser</label>
                <section className="admin-questions" aria-labelledby="admin-questions-heading">
                  <div className="admin-section-header"><h3 id="admin-questions-heading">Spørsmål</h3><button className="admin-button" type="button" onClick={addQuestion}>Legg til spørsmål</button></div>
                  {questions.map((question, index) => (
                    <div className="admin-question-editor" key={question.id}>
                      <label>Spørsmål {index + 1}<textarea value={question.text} onChange={(event) => updateQuestion(index, event.target.value)} rows={4} required /></label>
                      {questions.length > 1 && <button className="admin-remove" type="button" onClick={() => removeQuestion(index)}>Fjern</button>}
                    </div>
                  ))}
                </section>
                {!selected.isNew && <dl className="admin-meta"><div><dt>Undersøkelses-ID</dt><dd>{selected.id}</dd></div><div><dt>Besvarelser</dt><dd>{selected.response_count}</dd></div><div><dt>Spørsmålsversjon</dt><dd>{selected.question_version}</dd></div></dl>}
                {message && <p className={message.includes('Lagret') || message.includes('opprettet') ? 'admin-success' : 'form-error'} role="status">{message}</p>}
                <button className="primary-button" type="submit" disabled={saving || selected.mock}>{saving ? 'Lagrer …' : selected.isNew ? 'Opprett undersøkelse' : 'Lagre endringer'}</button>
                {!selected.isNew && <button className="admin-delete" type="button" onClick={() => setConfirmDelete(true)} disabled={selected.mock}>Slett undersøkelse</button>}
                {selected.mock && <p className="privacy-subnote">Mock-data kan ikke endres.</p>}
              </form>
            )}
          </>
        )}
      </aside>
      <ConfirmDialog
        open={confirmDelete}
        title={`Slette undersøkelsen «${selected?.title || ''}»?`}
        description="Undersøkelsen, spørsmålene og eventuelle svar beholdes, men skjules og slutter å ta imot besvarelser."
        confirmLabel="Slett undersøkelse"
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  );
}

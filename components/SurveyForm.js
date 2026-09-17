"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { questionOptions } from '@/lib/survey-questions';
import { useI18n } from '@/components/LocaleProvider';

export default function SurveyForm({ mockToken, mockSurveyId, questions, questionVersion, singleResponsePerProperty = true }) {
  const { t } = useI18n('surveys.form');
  const router = useRouter();
  const [answers, setAnswers] = useState(() => Object.fromEntries(questions.map(({ id }) => [id, ""])));
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [accepted, setAccepted] = useState(true);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => Array.isArray(value) ? value.length > 0 : Boolean(value)).length,
    [answers],
  );

  const isComplete = answeredCount === questions.length;
  const progress = Math.round((answeredCount / questions.length) * 100);

  function updateAnswer(questionId, value) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setErrorMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isComplete) {
      setErrorMessage(t('incomplete', {count: questions.length}));
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/survey/api/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ answers, website, mockToken, mockSurveyId, questionVersion }),
      });

      const data = await response.json();

      if (data.code === 'SURVEY_CHANGED' || data.code === 'SURVEY_CONFLICT') {
        setStatus('changed');
        setErrorMessage(data.message);
        return;
      }

      if (response.status === 409) {
        router.refresh();
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.message || t('submitError'));
      }

      setAccepted(data.accepted !== false);
      setStatus("success");
    } catch (error) {
      setStatus("idle");
      setErrorMessage(error.message);
    }
  }

  if (status === 'changed') {
    return <section className="form-error" role="alert"><p>{errorMessage}</p><button className="primary-button" type="button" onClick={() => {
      setAnswers(Object.fromEntries(questions.map(({ id }) => [id, ''])));
      setErrorMessage('');
      setStatus('idle');
      router.refresh();
    }}>{t('reload')}</button></section>;
  }

  if (status === "success") {
    return (
      <section className="success-card" aria-live="polite">
        <div className="success-icon" aria-hidden="true">
          ✓
        </div>
        <p className="eyebrow">{t('received')}</p>
        <h2>{t('thanks')}</h2>
        <p>{t(accepted ? 'success' : 'notCounted')}</p>
      </section>
    );
  }

  return (
    <form className="survey-form" onSubmit={handleSubmit} noValidate>
        <div className="form-progress" aria-label={t('progress', {answered: answeredCount, total: questions.length})}>
        <div className="progress-copy">
          <span>{t('yourResponse')}</span>
          <span>{t('answered', {answered: answeredCount, total: questions.length})}</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-value" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="honeypot" aria-hidden="true">
        <label htmlFor="website">{t('website')}</label>
        <input
          id="website"
          name="website"
          type="text"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="question-list">
        {questions.map((question) => (
          <fieldset className="question-card" key={question.id}>
            <legend>
              <span className="question-number">{question.number}</span>
              <span>{question.text}</span>
            </legend>
            <p className="privacy-subnote">{t(question.multiple ? 'selectMany' : 'selectOne')}</p>

            <div className="answer-grid">
              {questionOptions(question).map((option) => {
                const inputId = `${question.id}-${option.value}`;
                const checked = question.multiple ? (answers[question.id] || []).includes(option.value) : answers[question.id] === option.value;

                return (
                  <label
                    className={`answer-option${checked ? " is-selected" : ""}`}
                    htmlFor={inputId}
                    key={option.value}
                  >
                    <input
                      id={inputId}
                      type={question.multiple ? 'checkbox' : 'radio'}
                      name={question.id}
                      value={option.value}
                      checked={checked}
                      onChange={(event) =>
                        updateAnswer(question.id, question.multiple ? (event.target.checked
                          ? [...(answers[question.id] || []), option.value]
                          : answers[question.id].filter((value) => value !== option.value)) : option.value)
                      }
                    />
                    <span className="radio-mark" aria-hidden="true" />
                    <span>{question.options ? option.label : t(`answers.${option.value}`, {}, option.label)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {errorMessage ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="submit-row">
        <div>
          <p className="privacy-note">{t(singleResponsePerProperty ? 'onePerProperty' : 'onePerRecipient')}</p>
          <p className="privacy-subnote">{t('privacy')}</p>
        </div>
        <button
          className="primary-button"
          type="submit"
          disabled={status === "submitting"}
        >
          {status === "submitting" ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  );
}

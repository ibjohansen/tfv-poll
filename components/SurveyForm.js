"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { questionOptions } from '@/lib/survey-questions';
import { useI18n } from '@/components/LocaleProvider';

export default function SurveyForm({ mockToken, mockSurveyId, preview = false, questions, questionVersion, singleResponsePerProperty = true }) {
  const { t } = useI18n('surveys.form');
  const router = useRouter();
  const [answers, setAnswers] = useState(() => Object.fromEntries(questions.map(({ id }) => [id, ""])));
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [accepted, setAccepted] = useState(true);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const firstInputs = useRef(new Map());

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
      const unanswered = questions.filter(({ id }) => {
        const answer = answers[id];
        return Array.isArray(answer) ? answer.length === 0 : !answer;
      });
      setValidationAttempted(true);
      setErrorMessage(t('incomplete', {count: unanswered.length}));
      window.requestAnimationFrame(() => firstInputs.current.get(unanswered[0]?.id)?.focus());
      return;
    }

    if (preview) {
      setStatus('success');
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
      setValidationAttempted(false);
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
        <p className="eyebrow">{t(preview ? 'previewReceived' : 'received')}</p>
        <h2>{t(preview ? 'previewThanks' : 'thanks')}</h2>
        <p>{t(preview ? 'previewSuccess' : accepted ? 'success' : 'notCounted')}</p>
        {preview && <button className="primary-button" type="button" onClick={() => {
          setAnswers(Object.fromEntries(questions.map(({ id }) => [id, ''])));
          setValidationAttempted(false);
          setStatus('idle');
        }}>{t('previewAgain')}</button>}
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
        {questions.map((question) => {
          const answer = answers[question.id];
          const invalid = validationAttempted && (Array.isArray(answer) ? answer.length === 0 : !answer);
          const helpId = `question-help-${question.id}`;
          const errorId = `question-error-${question.id}`;
          return (
          <fieldset className={`question-card${invalid ? ' is-invalid' : ''}`} key={question.id} aria-describedby={`${helpId}${invalid ? ` ${errorId}` : ''}`}>
            <legend>
              <span className="question-number">{question.number}</span>
              <span>{question.text}</span>
            </legend>
            <p className="privacy-subnote" id={helpId}>{t(question.multiple ? 'selectMany' : 'selectOne')}</p>

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
                      ref={(element) => {
                        if (element && !firstInputs.current.has(question.id)) firstInputs.current.set(question.id, element);
                      }}
                      id={inputId}
                      type={question.multiple ? 'checkbox' : 'radio'}
                      name={question.id}
                      value={option.value}
                      checked={checked}
                      aria-invalid={invalid || undefined}
                      aria-describedby={`${helpId}${invalid ? ` ${errorId}` : ''}`}
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
            {invalid && <p className="question-error" id={errorId}>{t(question.multiple ? 'requiredMany' : 'requiredOne')}</p>}
          </fieldset>
          );
        })}
      </div>

      {errorMessage ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="submit-row">
        <div>
          <p className="privacy-note">{t(preview ? 'previewPrivacy' : singleResponsePerProperty ? 'onePerProperty' : 'onePerRecipient')}</p>
          <p className="privacy-subnote">{t(preview ? 'previewPrivacyHelp' : 'privacy')}</p>
        </div>
        <button
          className="primary-button"
          type="submit"
          disabled={status === "submitting"}
        >
          {status === "submitting" ? t('submitting') : t(preview ? 'previewSubmit' : 'submit')}
        </button>
      </div>
    </form>
  );
}

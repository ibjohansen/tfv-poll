"use client";

import { useMemo, useState } from "react";
import { answerOptions, surveyQuestions } from "@/data/survey";

const initialAnswers = {
  q1: "",
  q2: "",
  q3: "",
  q4: "",
};

export default function SurveyForm() {
  const [answers, setAnswers] = useState(initialAnswers);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const answeredCount = useMemo(
    () => Object.values(answers).filter(Boolean).length,
    [answers],
  );

  const isComplete = answeredCount === surveyQuestions.length;
  const progress = Math.round((answeredCount / surveyQuestions.length) * 100);

  function updateAnswer(questionId, value) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setErrorMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isComplete) {
      setErrorMessage("Svar på alle fire spørsmål før du sender inn.");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ answers, website }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Kunne ikke sende inn svaret.");
      }

      setStatus("success");
    } catch (error) {
      setStatus("idle");
      setErrorMessage(error.message);
    }
  }

  if (status === "success") {
    return (
      <section className="success-card" aria-live="polite">
        <div className="success-icon" aria-hidden="true">
          ✓
        </div>
        <p className="eyebrow">Svar mottatt</p>
        <h2>Takk for at du svarte.</h2>
        <p>
          Besvarelsen er lagret. Turufjell vel kan bruke de samlede svarene som
          grunnlag for det videre arbeidet.
        </p>
      </section>
    );
  }

  return (
    <form className="survey-form" onSubmit={handleSubmit} noValidate>
      <div className="form-progress" aria-label={`${answeredCount} av 4 spørsmål besvart`}>
        <div className="progress-copy">
          <span>Din besvarelse</span>
          <span>{answeredCount} av 4 besvart</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-value" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="honeypot" aria-hidden="true">
        <label htmlFor="website">Nettside</label>
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
        {surveyQuestions.map((question) => (
          <fieldset className="question-card" key={question.id}>
            <legend>
              <span className="question-number">{question.number}</span>
              <span>{question.text}</span>
            </legend>

            <div className="answer-grid">
              {answerOptions.map((option) => {
                const inputId = `${question.id}-${option.value}`;
                const checked = answers[question.id] === option.value;

                return (
                  <label
                    className={`answer-option${checked ? " is-selected" : ""}`}
                    htmlFor={inputId}
                    key={option.value}
                  >
                    <input
                      id={inputId}
                      type="radio"
                      name={question.id}
                      value={option.value}
                      checked={checked}
                      onChange={(event) =>
                        updateAnswer(question.id, event.target.value)
                      }
                    />
                    <span className="radio-mark" aria-hidden="true" />
                    <span>{option.label}</span>
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
          <p className="privacy-note">Vi ber ikke om navn eller e-post.</p>
          <p className="privacy-subnote">
            Svarene lagres i databasen med tidspunkt for innsending.
          </p>
        </div>
        <button
          className="primary-button"
          type="submit"
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Sender inn …" : "Send inn svar"}
        </button>
      </div>
    </form>
  );
}

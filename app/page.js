import SurveyForm from "@/components/SurveyForm";
import { surveyDocuments } from "@/data/survey";

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 2.75h6.25L18.5 8v13.25H7V2.75Z" />
      <path d="M13 2.75V8h5.25" />
      <path d="M9.75 12h6M9.75 15.25h6M9.75 18.5h3.75" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main>
      <div className="page-shell">
        <header className="hero">
          <div className="brand-mark" aria-hidden="true">TV</div>
          <div className="hero-copy">
            <p className="eyebrow">Turufjell vel</p>
            <h1>Turufjell vel - medlemsundersøkelse.</h1>
            <p className="hero-intro">
              Vi ønsker medlemmenes vurdering av informasjon og forventninger
              knyttet til et mulig alpinanlegg på Kristnatten, og hvordan
              vel-foreningen bør arbeide videre med saken.
            </p>
          </div>
        </header>

        <section className="info-section" aria-labelledby="before-you-answer">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Før du svarer</p>
              <h2 id="before-you-answer">Informasjon og dokumenter</h2>
            </div>
            <p>
              Les gjerne relevant bakgrunnsmateriale før du sender inn
              besvarelsen. Dokumentene åpnes i en ny fane.
            </p>
          </div>

          {surveyDocuments.length > 0 ? (
            <div className="document-list">
              {surveyDocuments.map((document) => (
                <a
                  className="document-card"
                  href={document.href}
                  target="_blank"
                  rel="noreferrer"
                  key={document.href}
                >
                  <span className="document-icon">
                    <DocumentIcon />
                  </span>
                  <span className="document-copy">
                    <strong>{document.title}</strong>
                    <span>{document.description}</span>
                  </span>
                  <span className="document-meta">{document.meta}</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="empty-documents">
              <span className="document-icon">
                <DocumentIcon />
              </span>
              <div>
                <strong>Dokumenter publiseres her</strong>
                <p>
                  Relevante vedlegg kan legges inn før undersøkelsen sendes ut
                  til medlemmene.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="survey-section" aria-labelledby="survey-heading">
          <div className="section-heading survey-heading">
            <div>
              <p className="eyebrow">4 spørsmål</p>
              <h2 id="survey-heading">Din vurdering</h2>
            </div>
            <p>Velg det alternativet som passer best for hvert spørsmål.</p>
          </div>

          <SurveyForm />
        </section>

        <footer className="page-footer">
          <span>Turufjell vel</span>
          <span>Medlemsundersøkelse</span>
        </footer>
      </div>
    </main>
  );
}

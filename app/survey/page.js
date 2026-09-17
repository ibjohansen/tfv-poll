import Link from "next/link";
import { cookies } from 'next/headers';
import MemberInfo from "@/components/MemberInfo";
import { getMockSurveyAccess, getSurveyAccess, surveySessionCookieName } from "@/lib/membership";
import BrandLogo from '@/components/BrandLogo';
import SurveyForm from "@/components/SurveyForm";
import { surveyDocuments, surveyLinkParameters } from "@/data/survey";
import { isMockMode } from '@/lib/mock-store';
import { getServerI18n } from '@/lib/i18n/server';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 2.75h6.25L18.5 8v13.25H7V2.75Z" />
      <path d="M13 2.75V8h5.25" />
      <path d="M9.75 12h6M9.75 15.25h6M9.75 18.5h3.75" />
    </svg>
  );
}

export default async function HomePage({ searchParams }) {
  const { t } = await getServerI18n('surveys.page');
  const params = await searchParams;
  const memberToken = params[surveyLinkParameters.member];
  const requestedSurveyId = params[surveyLinkParameters.survey];
  let access;
  try {
    const sessionSecret = (await cookies()).get(surveySessionCookieName())?.value;
    access = isMockMode() && memberToken
      ? await getMockSurveyAccess(memberToken, requestedSurveyId)
      : await getSurveyAccess(sessionSecret);
  } catch {
    access = { status: "unavailable", message: t('unavailable') };
  }
  const documents = [...surveyDocuments, ...(access.survey?.attachments || [])];
  return (
    <main>
      <div className="page-shell">
        <header className="hero">
          <div className="brand-logo">
            <BrandLogo variant="stacked" priority className="h-auto w-full" />
          </div>
          <div className="hero-copy">
            <p className="eyebrow">Turufjell Vel</p>
            <h1>{t('title')}</h1>
            <p className="hero-intro">{t('introduction')}</p>
          </div>
        </header>

        <MemberInfo access={access} />

        <section className="info-section" aria-labelledby="before-you-answer">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t('before')}</p>
              <h2 id="before-you-answer">{t('information')}</h2>
            </div>
            <p>{t('documentHelp')}</p>
          </div>

          {documents.length > 0 ? (
            <div className="document-list">
              {documents.map((document) => (
                <a
                  className="document-card"
                  href={document.href || document.url}
                  target="_blank"
                  rel="noreferrer"
                  key={document.href || document.id}
                >
                  <span className="document-icon">
                    <DocumentIcon />
                  </span>
                  <span className="document-copy">
                    <strong>{document.title}</strong>
                    <span>{document.description || document.original_filename}</span>
                  </span>
                  <span className="document-meta">{document.meta || document.original_filename?.split('.').pop()?.toUpperCase()}</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="empty-documents">
              <span className="document-icon">
                <DocumentIcon />
              </span>
              <div>
                <strong>{t('documentsComing')}</strong>
                <p>{t('documentsComingHelp')}</p>
              </div>
            </div>
          )}
        </section>

        {access.status === "ready" && <section className="survey-section" aria-labelledby="survey-heading">
          <div className="section-heading survey-heading">
            <div>
              <p className="eyebrow">{t('questionCount', {count: access.survey.questions.length})}</p>
              <h2 id="survey-heading">{t('assessment')}</h2>
            </div>
            <p>{t('answerHelp')}</p>
          </div>

          <SurveyForm key={`${access.survey.id}:${access.survey.question_version}`} questionVersion={access.survey.question_version} mockToken={isMockMode() ? memberToken : undefined} mockSurveyId={isMockMode() ? requestedSurveyId : undefined} questions={access.survey.questions} />
        </section>}

        <footer className="page-footer">
          <span>Turufjell Vel</span>
          <Link href="/admin">{t('administration')}</Link>
        </footer>
      </div>
    </main>
  );
}

import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import { getServerI18n } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getServerI18n('general.cookies');
  return { title: `${t('title')} | Turufjell Vel`, description: t('introduction') };
}

export default async function CookieInformationPage() {
  const { t } = await getServerI18n('general.cookies');
  const rows = ['locale', 'publicSession', 'memberSession', 'surveySession', 'adminSession', 'adminSecurity', 'notice'];
  return <div className="member-profile-page">
    <SiteHeader />
    <main id="main-content" className="legal-information-page" tabIndex={-1}>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1>{t('title')}</h1>
      <p className="legal-information-intro">{t('introduction')}</p>
      <section aria-labelledby="cookie-use-title">
        <h2 id="cookie-use-title">{t('useTitle')}</h2>
        <p>{t('useText')}</p>
        <div className="legal-table-scroll" tabIndex={0} role="region" aria-label={t('tableLabel')}>
          <table><thead><tr><th scope="col">{t('columns.name')}</th><th scope="col">{t('columns.purpose')}</th><th scope="col">{t('columns.duration')}</th></tr></thead>
            <tbody>{rows.map((key) => <tr key={key}><th scope="row">{t(`rows.${key}.name`)}</th><td>{t(`rows.${key}.purpose`)}</td><td>{t(`rows.${key}.duration`)}</td></tr>)}</tbody></table>
        </div>
      </section>
      <section><h2>{t('consentTitle')}</h2><p>{t('consentText')}</p></section>
      <section><h2>{t('controlTitle')}</h2><p>{t('controlText')}</p></section>
      <section><h2>{t('sourcesTitle')}</h2><p>{t('sourcesText')} <a href="https://lovdata.no/nav/lov/2024-12-13-76/kap3" target="_blank" rel="noreferrer">{t('lawSource')}</a> {t('and')} <a href="https://www.datatilsynet.no/personvern-pa-ulike-omrader/internett-og-apper/bruk-av-informasjonskapsler-og-andre-sporingsteknologier/" target="_blank" rel="noreferrer">{t('guidanceSource')}</a>.</p></section>
      <section><h2>{t('contactTitle')}</h2><p>{t('contactText')} <a href="mailto:post@turufjellvel.no">post@turufjellvel.no</a>.</p></section>
      <p><Link href="/">{t('back')}</Link></p>
    </main>
  </div>;
}

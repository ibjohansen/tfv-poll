import Link from 'next/link';
import { cookies } from 'next/headers';
import SiteHeader from '@/components/SiteHeader';
import MemberSelfServiceProfile from '@/components/MemberSelfServiceProfile';
import { getMemberSelfServiceProfile } from '@/lib/member-self-service';
import { memberSessionCookieName } from '@/lib/member-self-service-utils';
import { getServerI18n } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata() {
  const { t } = await getServerI18n('members.profilePage');
  return { title: t('metadata'), robots: { index: false, follow: false } };
}

export default async function MemberProfilePage({ searchParams }) {
  const { t } = await getServerI18n('members.profilePage');
  const secret = (await cookies()).get(memberSessionCookieName())?.value;
  const params = await searchParams;
  let profile = null;
  try { profile = await getMemberSelfServiceProfile(secret, params?.member); } catch { profile = null; }
  const invalid = params?.status === 'invalid';
  const emailChange = params?.emailChange;
  return <div className="member-profile-page"><SiteHeader /><main id="main-content" className="member-profile-main" tabIndex={-1}>
    <header className="member-profile-hero"><p className="eyebrow">{t('eyebrow')}</p><h1>{t('title')}</h1><p>{t('introduction')}</p></header>
    {emailChange === 'completed' && <p className="admin-success" role="status">{t('emailCompleted')}</p>}
    {emailChange === 'old-confirmed' && <p className="admin-success" role="status">{t('oldConfirmed')}</p>}
    {profile ? <MemberSelfServiceProfile key={profile.member.id} initialProfile={JSON.parse(JSON.stringify(profile))} /> : <section className="member-profile-section member-profile-empty"><h2>{t('accessRequired')}</h2><p>{invalid ? t('invalid') : t('requestLink')}</p><Link className="primary-button" href="/#medlemsopplysninger">{t('home')}</Link></section>}
  </main></div>;
}

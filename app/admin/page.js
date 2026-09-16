import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { getAdminTaskCount } from '@/lib/member-self-service';
import AdminModuleHeader, { adminModules, ModuleIcon } from '@/components/AdminModuleHeader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const descriptions = {
  inbox: 'Behandle nye innmeldinger, eierskifter og matrikkelavklaringer.',
  members: 'Finn, opprett og vedlikehold medlemmer og deres personlige tilgangslenker.',
  map: 'Kontroller grender, adresser, eiendommer og medlemsregisteret i kart.',
  matrikkel: 'Oppdater matrikkelopplysninger for ett, flere eller alle medlemmer.',
  newsletters: 'Opprett, test og send nyhetsbrev til valgte e-postgrupper.',
  surveys: 'Opprett, rediger, åpne, lukk og følg opp spørreundersøkelser.',
  web: 'Opprett og publiser strukturerte informasjonssider, bilder og dokumenter.',
  usage: 'Se anonyme dagsaggregater for sidevisninger og grove enhetskategorier.',
  audit: 'Se hvem som har endret medlemmer, undersøkelser og webinnhold.',
};

export default async function AdminPage() {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  let taskCount = 0;
  try { taskCount = await getAdminTaskCount(); } catch { /* Header and tile remain usable without a count. */ }
  const modules = adminModules.filter(({ key }) => key !== 'overview');
  return <main className="admin-shell"><AdminModuleHeader active="overview" title="Medlemsservice" email={session.user.email} pendingTaskCount={taskCount} /><section className="admin-content"><section className="admin-module-grid" aria-label="Moduler">{modules.map((module) => <Link href={module.href} className="admin-module-card" key={module.key}><div className="admin-module-title"><h2>{module.label}</h2>{module.key === 'inbox' && taskCount > 0 && <span className="admin-task-count">{taskCount} ubehandlet{taskCount === 1 ? '' : 'e'}</span>}</div><p>{descriptions[module.key]}</p><span className="module-link"><span>Åpne</span><ModuleIcon name={module.icon} /></span></Link>)}</section></section></main>;
}

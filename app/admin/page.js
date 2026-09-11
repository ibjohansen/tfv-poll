import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import AdminModuleHeader from '@/components/AdminModuleHeader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminPage() {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  return <main className="admin-shell"><AdminModuleHeader active="overview" title="Medlemsservice" email={session.user.email} /><section className="admin-content"><section className="admin-module-grid" aria-label="Moduler"><Link href="/admin/inbox" className="admin-module-card"><h2>Innboks</h2><p>Behandle nye innmeldinger, eierskifter og andre medlemshenvendelser.</p><span>Åpne innboksen</span></Link><Link href="/admin/members" className="admin-module-card"><h2>Medlemsregister</h2><p>Finn, opprett og vedlikehold medlemmer og deres personlige tilgangslenker.</p><span>Åpne medlemsregisteret</span></Link><Link href="/admin/surveys" className="admin-module-card"><h2>Undersøkelser</h2><p>Opprett, rediger, åpne, lukk og følg opp spørreundersøkelser.</p><span>Åpne undersøkelser</span></Link><Link href="/admin/web" className="admin-module-card"><h2>Web</h2><p>Opprett og publiser strukturerte informasjonssider, bilder og dokumenter.</p><span>Administrer nettsider</span></Link></section></section></main>;
}

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import AdminAuditLog from '@/components/AdminAuditLog';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import { getAdminAuditLog, getAuditedTables } from '@/lib/admin-audit';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminAuditPage({ searchParams }) {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  const params = await searchParams;
  const actor = typeof params.actor === 'string' ? params.actor.trim().slice(0, 320) : '';
  const tables = getAuditedTables();
  const table = typeof params.table === 'string' && tables.includes(params.table) ? params.table : '';
  const page = /^\d{1,6}$/.test(params.page || '') ? Number(params.page) : 1;
  let data;
  try { data = await getAdminAuditLog({ actor, table, page }); } catch { data = null; }
  return <main className="admin-shell"><AdminModuleHeader active="audit" title="Brukerendringer" email={session.user.email} /><section className="admin-content">{data ? <AdminAuditLog data={data} actor={actor} table={table} tables={tables} /> : <p className="form-error" role="alert">Endringsloggen er midlertidig utilgjengelig. Kontroller at databaseskjemaet er oppdatert.</p>}</section></main>;
}

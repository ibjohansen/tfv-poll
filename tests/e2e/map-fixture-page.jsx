// Copied only into the disposable browser-test app by server.mjs.
import { requirePermission } from '@/lib/admin-access';
import MapExplorer from '@/components/MapExplorer/MapExplorer';

export default async function MapBrowserFixture() {
  await requirePermission('members');
  return <main className="admin-main"><h1>Isolert karttest</h1>
    <section aria-label="Test av kart og registerkontroll"><MapExplorer canMatrikkelSync /></section>
  </main>;
}

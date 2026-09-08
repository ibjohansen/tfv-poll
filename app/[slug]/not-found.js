import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';

export default function CmsNotFound() {
  return <div className="cms-public-page"><SiteHeader /><main className="cms-public-main"><section className="cms-not-found"><p className="eyebrow">404</p><h1>Siden finnes ikke</h1><p>Siden kan være flyttet, avpublisert eller slettet.</p><Link href="/">Til forsiden</Link></section></main></div>;
}

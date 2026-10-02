// Copied only into the disposable browser-test app by server.mjs.
import PublicActivityMap from '@/components/ActivityMap/PublicActivityMap';

const features = [
  { id: 'custom-activity', name: 'Trugerunden', category: 'custom-category', categoryName: 'Vinteraktiviteter', categoryColor: '#20636c',
    featureType: 'custom-type', typeName: 'Trugetur', geometryKind: 'line', tooltipText: 'Følg vintermerkingen.',
    geometry: { type: 'LineString', coordinates: [[9.493, 60.472], [9.495, 60.474]] } },
  { id: 'activity-cycle-1', name: 'Sykkelrunden', category: 'cycling', featureType: 'trail', alpineColor: null, season: 'summer',
    geometry: { type: 'Polygon', coordinates: [[[9.488, 60.469], [9.494, 60.469], [9.494, 60.473], [9.488, 60.469]]] } },
  { id: 'activity-alpine-1', name: 'Blåløypa', category: 'alpine', activityNumber: '4A', featureType: 'trail', alpineColor: 'blue', season: 'winter',
    geometry: { type: 'LineString', coordinates: [[9.493, 60.472], [9.498, 60.472], [9.498, 60.476]] } },
  { id: 'retail-point', name: 'Kafeen', category: 'retail', categoryName: 'Utsalg', categoryColor: '#805c2f', featureType: 'point', typeName: 'Sted',
    season: 'all_year', websiteUrl: 'https://example.test/kafe', tooltipText: 'Servering ved alpinanlegget.', geometry: { type: 'Point', coordinates: [9.493,60.472] } },
  { id: 'activity-park-1', name: 'Terrengparken', category: 'alpine', featureType: 'park', alpineColor: null,
    geometry: { type: 'Point', coordinates: [9.496, 60.474] } },
  { id: 'activity-sledding-1', name: 'Akebakken', category: 'alpine', featureType: 'sledding', alpineColor: null,
    geometry: { type: 'Point', coordinates: [9.491, 60.471] } },
  { id: 'activity-lift-1', name: 'Testheisen', category: 'alpine', featureType: 'lift', alpineColor: null,
    geometry: { type: 'Polygon', coordinates: [[[9.494, 60.471], [9.495, 60.471], [9.497, 60.476], [9.496, 60.476], [9.494, 60.471]]] } },
];

export default function ActivityMapBrowserFixture() {
  return <main className="public-main"><PublicActivityMap features={features} /></main>;
}

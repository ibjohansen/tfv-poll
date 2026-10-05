// Copied only into the disposable browser-test app by server.mjs.
import PublicActivityMap from '@/components/ActivityMap/PublicActivityMap';

const features = [
  { id: 'cross-country-activity', name: 'Testløypa', category: 'cross_country', categoryName: 'Langrenn', categoryColor: '#2f6fb0',
    featureType: 'route', typeName: 'Løype', geometryKind: 'line', season: 'winter', tooltipText: 'Prepareres av Vassfarfjellet løypelag',
    sources: [{ id: 'kartverket', name: 'Kartverket', sourceUrl: 'https://kartverket.no/api-og-data/friluftsliv',
      licenseName: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.no' }],
    geometry: { type: 'LineString', coordinates: [[9.49, 60.47], [9.496, 60.475]] } },
  { id: 'remote-cross-country', name: 'Fjernløypa', category: 'cross_country', categoryName: 'Langrenn', categoryColor: '#2f6fb0',
    featureType: 'route', typeName: 'Løype', geometryKind: 'line', season: 'winter', tooltipText: 'Preparert av et annet løypelag',
    sources: [{ id: 'openstreetmap', name: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/copyright',
      licenseName: 'ODbL', licenseUrl: 'https://opendatacommons.org/licenses/odbl/' }],
    geometry: { type: 'LineString', coordinates: [[9.62, 60.53], [9.66, 60.55]] } },
  { id: 'custom-activity', name: 'Trugerunden', category: 'custom-category', categoryName: 'Vinteraktiviteter', categoryColor: '#20636c',
    featureType: 'custom-type', typeName: 'Trugetur', geometryKind: 'line', tooltipText: 'Følg vintermerkingen.',
    geometry: { type: 'LineString', coordinates: [[9.493, 60.472], [9.495, 60.474]] } },
  { id: 'activity-cycle-1', name: 'Sykkelrunden', category: 'cycling', featureType: 'trail', alpineColor: null, season: 'summer',
    geometry: { type: 'Polygon', coordinates: [[[9.488, 60.469], [9.494, 60.469], [9.494, 60.473], [9.488, 60.469]]] } },
  { id: 'hiking-activity', name: 'Utsiktsrunden', category: 'hiking', featureType: 'route', season: 'summer',
    geometry: { type: 'LineString', coordinates: [[9.489, 60.473], [9.493, 60.476], [9.498, 60.475]] } },
  { id: 'activity-alpine-1', name: 'Blåløypa', category: 'alpine', activityNumber: '4A', featureType: 'trail', alpineColor: 'blue', season: 'winter',
    geometry: { type: 'LineString', coordinates: [[9.493, 60.472], [9.498, 60.472], [9.498, 60.476]] } },
  { id: 'retail-point', name: 'Kafeen', category: 'retail', categoryName: 'Utsalg', categoryColor: '#00546c', featureType: 'point', featureSubtype: 'serving', subtypeName: 'Servering', typeName: 'Sted',
    season: 'all_year', websiteUrl: 'https://example.test/kafe', tooltipText: 'Servering ved alpinanlegget.', geometry: { type: 'Point', coordinates: [9.493,60.472] } },
  { id: 'training-point', name: 'Treningsområdet', category: 'training', categoryName: 'Trening', categoryColor: '#6b478c', featureType: 'point', typeName: 'Trening',
    season: 'all_year', tooltipText: 'Treningsområde utendørs.', geometry: { type: 'Point', coordinates: [9.499, 60.473] } },
  { id: 'activity-park-1', name: 'Terrengparken', category: 'alpine', featureType: 'park', alpineColor: null,
    geometry: { type: 'Point', coordinates: [9.496, 60.474] } },
  { id: 'activity-sledding-1', name: 'Akebakken', category: 'alpine', featureType: 'sledding', alpineColor: null,
    geometry: { type: 'Point', coordinates: [9.491, 60.471] } },
  { id: 'activity-lift-1', name: 'Testheisen', category: 'alpine', featureType: 'lift', featureSubtype: 'bowl_lift', subtypeName: 'Skålheis', alpineColor: null,
    geometry: { type: 'Polygon', coordinates: [[[9.494, 60.471], [9.495, 60.471], [9.497, 60.476], [9.496, 60.476], [9.494, 60.471]]] } },
  { id: 'activity-tbar-1', name: 'T-krokheisen', category: 'alpine', featureType: 'lift', featureSubtype: 't_bar', subtypeName: 'T-krok', alpineColor: null,
    geometry: { type: 'LineString', coordinates: [[9.49, 60.471], [9.492, 60.474]] } },
  { id: 'parking-point', name: 'Parkering ved skisenteret', category: 'parking', categoryName: 'Parkering', categoryColor: '#00546c', featureType: 'parking', typeName: 'Parkering',
    geometry: { type: 'Point', coordinates: [9.5, 60.47] } },
  { id: 'wc-point', name: 'Toalett ved skisenteret', category: 'wc', categoryName: 'WC', categoryColor: '#00546c', featureType: 'restroom', typeName: 'WC',
    geometry: { type: 'Point', coordinates: [9.501, 60.471] } },
  { id: 'charging-point', name: 'El-bil-lading', category: 'retail', categoryName: 'Utsalg', categoryColor: '#00546c', featureType: 'point', typeName: 'Sted',
    geometry: { type: 'Point', coordinates: [9.502, 60.472] } },
];

export default function ActivityMapBrowserFixture() {
  return <main className="public-main"><PublicActivityMap features={features} /></main>;
}

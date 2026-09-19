export const USAGE_PAGE_TYPES = ['home', 'survey', 'self_service', 'article'];
export const USAGE_DEVICE_CATEGORIES = ['mobile', 'tablet', 'desktop', 'unknown'];
export const USAGE_PERIODS = [7, 30, 90, 365, 730, 'all'];
export const WEB_VITAL_NAMES = ['LCP', 'INP', 'CLS'];
export const WEB_VITAL_RATINGS = ['good', 'needs-improvement', 'poor'];

export const usagePageLabels = {
  home: 'Forside',
  survey: 'Undersøkelse',
  self_service: 'Mine opplysninger',
  article: 'Informasjonsside',
};

export const usageDeviceLabels = {
  mobile: 'Mobil',
  tablet: 'Nettbrett / liten skjerm',
  desktop: 'Datamaskin',
  unknown: 'Ukjent',
};

export function pageTypeForPath(pathname) {
  if (pathname === '/') return 'home';
  if (pathname === '/survey' || pathname === '/survey/') return 'survey';
  if (pathname === '/mine-opplysninger' || pathname === '/mine-opplysninger/') return 'self_service';
  if (typeof pathname === 'string' && /^\/[a-z0-9][a-z0-9-]*\/?$/i.test(pathname)
    && !['/admin', '/api'].includes(pathname.replace(/\/$/, ''))) return 'article';
  return null;
}

export function deviceCategoryForWidth(width) {
  if (!Number.isFinite(width) || width <= 0) return 'unknown';
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

export function normalizeUsageEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !['pageType', 'deviceCategory'].includes(key))
    || !USAGE_PAGE_TYPES.includes(input.pageType)
    || !USAGE_DEVICE_CATEGORIES.includes(input.deviceCategory)) {
    throw new Error('Invalid usage event');
  }
  return { pageType: input.pageType, deviceCategory: input.deviceCategory };
}

export function normalizeWebVital(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !['name', 'value', 'rating', 'deviceCategory'].includes(key))
    || !WEB_VITAL_NAMES.includes(input.name)
    || !WEB_VITAL_RATINGS.includes(input.rating)
    || !USAGE_DEVICE_CATEGORIES.includes(input.deviceCategory)
    || !Number.isFinite(input.value) || input.value < 0 || input.value > 120_000) {
    throw new Error('Invalid web vital');
  }
  return { name: input.name, value: Math.round(input.value * 1000) / 1000, rating: input.rating, deviceCategory: input.deviceCategory };
}

export function normalizeUsageBatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !['events', 'webVitals'].includes(key))) throw new Error('Invalid usage event');
  const events = Array.isArray(input.events) ? input.events : [];
  const webVitals = Array.isArray(input.webVitals) ? input.webVitals : [];
  if ((!events.length && !webVitals.length) || events.length > 20 || webVitals.length > 20) throw new Error('Invalid usage event');
  return { events: events.map(normalizeUsageEvent), webVitals: webVitals.map(normalizeWebVital) };
}

export function normalizeUsagePeriod(value) {
  const period = value === 'all' ? 'all' : Number(value || 30);
  if (!USAGE_PERIODS.includes(period)) throw new Error('Invalid usage period');
  return period;
}

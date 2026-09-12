// Netlify håndhever denne regelen før Next.js-funksjonen kjøres. Den delte
// Postgres-begrensningen i applikasjonen kombinerer i tillegg klient,
// nettleserindikator, søkeverdi og samlet trafikk.
export default function publicMemberRateLimit() {
  return undefined;
}

export const config = {
  path: [
    '/api/member-access/request',
    '/api/member-access/verify',
    '/api/member-access/email-change/verify',
    '/api/membership-requests',
    '/api/membership-requests/verify',
    '/api/survey-access/verify',
  ],
  rateLimit: {
    windowLimit: 5,
    windowSize: 180,
    aggregateBy: ['ip', 'domain'],
  },
};

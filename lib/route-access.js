import { isPublicCmsPath } from './cms-validation.js';

export function isPublicPath(pathname) {
  return pathname === '/' || pathname === '/admin/login' ||
    pathname === '/mine-opplysninger' || pathname === '/api/member-access/request' ||
    pathname === '/api/member-access/verify' || pathname === '/api/member-access/profile' ||
    pathname === '/api/member-access/export' || pathname === '/api/member-access/logout' ||
    pathname === '/api/member-access/email-change/verify' || pathname === '/api/survey-access/verify' ||
    pathname === '/api/membership-requests' || pathname === '/api/membership-requests/verify' ||
    pathname === '/survey' || pathname === '/survey/api/responses' ||
    pathname === '/api/usage/pageview' ||
    /^\/api\/map\/hamlets\/[1-9][0-9]{0,15}\/properties$/.test(pathname) ||
    pathname === '/api/webhooks/mailersend' ||
    pathname.startsWith('/survey/dokumenter/') ||
    pathname.startsWith('/api/cms/files/') || pathname.startsWith('/api/cms/pages/') || isPublicCmsPath(pathname) ||
    pathname === '/api/auth' || pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/static/') || pathname === '/_next/image' ||
    /^\/carousel\/[^/?#]+_tf[1-9][0-9]*\.(?:jpe?g|png|webp|avif)$/i.test(pathname) ||
    pathname === '/_next/webpack-hmr' || pathname === '/icon' || pathname === '/apple-icon' || pathname === '/icon.png' || pathname === '/favicon.ico' ||
    pathname === '/Turufjell_liggende_VEL_logo_brun.svg' ||
    pathname === '/Turufjell_liggende_VEL_logo_creme.svg' ||
    pathname === '/Turufjell_staende_VEL_logo_brun.svg' ||
    pathname === '/Turufjell_staende_VEL_logo_creme.svg' ||
    pathname === '/turufjell-vel-logo-horizontal-dark.png' ||
    pathname === '/turufjell-vel-logo-horizontal-light.png' ||
    pathname === '/turufjell-vel-logo-stacked-dark.png' ||
    pathname === '/turufjell-vel-logo-stacked-light.png' || pathname === '/turufjell.jpeg';
}

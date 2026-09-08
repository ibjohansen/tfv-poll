import { isPublicCmsPath } from './cms-validation.js';

export function isPublicPath(pathname) {
  return pathname === '/' || pathname === '/admin/login' ||
    pathname === '/survey' || pathname === '/survey/api/responses' ||
    pathname.startsWith('/survey/dokumenter/') ||
    pathname.startsWith('/api/cms/files/') || pathname.startsWith('/api/cms/pages/') || isPublicCmsPath(pathname) ||
    pathname === '/api/auth' || pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/static/') || pathname === '/_next/image' ||
    pathname === '/_next/webpack-hmr' || pathname === '/turufjell-vel-logo.png' ||
    pathname === '/turufjell-vel-header.png' || pathname === '/turufjell.jpeg';
}

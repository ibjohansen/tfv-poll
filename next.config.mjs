import bundleAnalyzer from '@next/bundle-analyzer';
import { isAuthConfigured } from './lib/admin-policy.js';
import { getSecurityContext } from './lib/security-config.js';

// Netlify CLI cannot expose secret, Functions-scoped runtime variables to its
// local build subprocess. Cloud builds still validate the full production
// configuration; deployed route handlers independently fail closed at runtime.
if (process.env.CONTEXT === 'production' && process.env.NETLIFY_LOCAL !== 'true') {
  getSecurityContext(process.env);
  if (!isAuthConfigured(process.env)) throw new Error('Production admin authentication is not configured safely');
}

const securityHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  images: {
    minimumCacheTTL: 604800,
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/carousel/optimized/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};

export default bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })(nextConfig);

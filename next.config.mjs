import { isAuthConfigured } from './lib/admin-policy.js';
import { getSecurityContext } from './lib/security-config.js';

if (process.env.CONTEXT === 'production') {
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
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

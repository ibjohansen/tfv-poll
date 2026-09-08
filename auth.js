import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { isAllowedAdmin, isAuthConfigured } from './lib/admin-policy.js';

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  providers: isAuthConfigured() ? [MicrosoftEntraID({
    clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
    authorization: { params: { scope: 'openid profile email' } },
    profile(profile) {
      return { id: profile.sub, name: profile.name, email: profile.email || profile.preferred_username, image: null };
    },
  })] : [],
  pages: { signIn: '/admin/login', error: '/admin/login' },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  callbacks: {
    signIn({ profile, account }) {
      return account?.provider === 'microsoft-entra-id' && isAllowedAdmin({
        email: profile?.email || profile?.preferred_username, tenantId: profile?.tid,
      });
    },
    jwt({ token, profile }) {
      if (profile) {
        token.tenantId = profile.tid;
        token.email = profile.email || profile.preferred_username;
      }
      return token;
    },
    session({ session, token }) {
      session.user.tenantId = token.tenantId;
      return session;
    },
  },
}));

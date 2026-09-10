import { auth } from '../auth.js';
import { isAllowedAdmin, isAllowedMatrikkelSync, isAuthConfigured } from './admin-policy.js';

export async function requireAdmin() {
  const session = isAuthConfigured() ? await auth() : null;
  if (!isAllowedAdmin(session?.user)) {
    throw new Error('Unauthorized');
  }
  return session.user;
}

export async function requireMatrikkelSync() {
  const session = isAuthConfigured() ? await auth() : null;
  if (!isAllowedMatrikkelSync(session?.user)) throw new Error('Unauthorized');
  return session.user;
}

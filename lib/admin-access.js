import { auth } from '../auth.js';
import { isAllowedAdmin, isAllowedMatrikkelSync, isAuthConfigured } from './admin-policy.js';

export async function requireAdmin() {
  if (!isAuthConfigured() || !isAllowedAdmin((await auth())?.user)) {
    throw new Error('Unauthorized');
  }
}

export async function requireMatrikkelSync() {
  const session = isAuthConfigured() ? await auth() : null;
  if (!isAllowedMatrikkelSync(session?.user)) throw new Error('Unauthorized');
  return session.user;
}

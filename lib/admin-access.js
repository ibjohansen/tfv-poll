import { auth } from '../auth.js';
import { adminPermissions, isAllowedAdmin, isAllowedMatrikkelSync, isAuthConfigured } from './admin-policy.js';

export async function requireAdmin() {
  const session = isAuthConfigured() ? await auth() : null;
  if (!isAllowedAdmin(session?.user)) {
    throw new Error('Unauthorized');
  }
  return session.user;
}

export async function requirePermission(permission) {
  const user = await requireAdmin();
  if (!adminPermissions(user).has(permission)) throw new Error('Forbidden');
  return user;
}

export async function requireMatrikkelSync() {
  const session = isAuthConfigured() ? await auth() : null;
  if (!isAllowedMatrikkelSync(session?.user)) throw new Error('Unauthorized');
  return session.user;
}

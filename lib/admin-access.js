import { cache } from 'react';
import { auth } from '../auth.js';
import { adminPermissions, isAllowedAdmin, isAllowedMatrikkelSync, isAuthConfigured } from './admin-policy.js';

const readAdminSession = cache(async () => (isAuthConfigured() ? auth() : null));

export function getAdminSession() {
  return readAdminSession();
}

export async function requireAdmin() {
  const session = await getAdminSession();
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
  const session = await getAdminSession();
  if (!isAllowedMatrikkelSync(session?.user)) throw new Error('Unauthorized');
  return session.user;
}

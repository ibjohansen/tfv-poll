export function isAllowedAdmin(identity, env = process.env) {
  const tenant = env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID;
  if (!tenant || !identity || identity.tenantId?.toLowerCase() !== tenant.toLowerCase()) return false;
  const email = typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@turufjellvel\.no$/.test(email)) return false;
  const allowed = (env.ADMIN_EMAILS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  return !allowed.length || allowed.includes(email);
}

export function isAllowedMatrikkelSync(identity, env = process.env) {
  if (!isAllowedAdmin(identity, env)) return false;
  const email = typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : '';
  const allowed = (env.MATRIKKEL_SYNC_EMAILS || '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email);
}

export function isAuthConfigured(env = process.env) {
  return Boolean(env.AUTH_SECRET && env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
    /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID || ''));
}

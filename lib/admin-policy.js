export const ADMIN_ROLES = new Set([
  'TFV.ReadOnly', 'TFV.MemberAdmin', 'TFV.SurveyAdmin', 'TFV.CmsEditor',
  'TFV.MatrikkelAdmin', 'TFV.SecurityAudit',
]);

const ROLE_PERMISSIONS = {
  'TFV.ReadOnly': ['read'],
  'TFV.MemberAdmin': ['read', 'members'],
  'TFV.SurveyAdmin': ['read', 'surveys'],
  'TFV.CmsEditor': ['read', 'cms'],
  'TFV.MatrikkelAdmin': ['read', 'matrikkel'],
  'TFV.SecurityAudit': ['read', 'audit'],
};

function configuredEmails(env) {
  const values = (env.ADMIN_EMAILS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!values.length || values.some((email) => !/^[^@\s]+@turufjellvel\.no$/.test(email))) return null;
  return [...new Set(values)];
}

function requiredRoles(env) {
  const roles = (env.ADMIN_REQUIRED_ROLES || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (roles.some((role) => !ADMIN_ROLES.has(role))) return null;
  return roles;
}

export function isAllowedAdmin(identity, env = process.env) {
  const tenant = env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID;
  const allowed = configuredEmails(env);
  const roles = requiredRoles(env);
  if (!tenant || !allowed || !roles || !identity || identity.tenantId?.toLowerCase() !== tenant.toLowerCase()) return false;
  const email = typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : '';
  if (!allowed.includes(email)) return false;
  if (!roles.length) return true;
  return Array.isArray(identity.roles) && identity.roles.some((role) => roles.includes(role));
}

export function adminPermissions(identity, env = process.env) {
  if (!isAllowedAdmin(identity, env)) return new Set();
  const required = requiredRoles(env);
  if (!required?.length) return new Set(['read', 'members', 'surveys', 'cms', 'matrikkel', 'audit']);
  const identityRoles = Array.isArray(identity.roles) ? identity.roles.filter((role) => required.includes(role)) : [];
  return new Set(identityRoles.flatMap((role) => ROLE_PERMISSIONS[role] || []));
}

export function isAllowedMatrikkelSync(identity, env = process.env) {
  if (!isAllowedAdmin(identity, env)) return false;
  const required = requiredRoles(env);
  if (required?.length) return adminPermissions(identity, env).has('matrikkel');
  const email = typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : '';
  const allowed = (env.MATRIKKEL_SYNC_EMAILS || '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email);
}

export function isAuthConfigured(env = process.env) {
  return Boolean(env.AUTH_SECRET && env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    env.AUTH_MICROSOFT_ENTRA_ID_SECRET && configuredEmails(env) && requiredRoles(env) &&
    /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID || ''));
}

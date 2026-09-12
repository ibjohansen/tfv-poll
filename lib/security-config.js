const ENVIRONMENTS = new Set(['development', 'staging', 'production']);
const AUDIENCE_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,99}$/i;

export function getSecurityContext(env = process.env) {
  const environment = env.APP_ENVIRONMENT || (env.NODE_ENV === 'production' ? '' : 'development');
  const audience = env.TOKEN_AUDIENCE || (environment === 'development' ? 'tfv-development' : '');
  const hmacKey = env.SECURITY_EVENT_HMAC_KEY || (environment === 'development' ? 'development-only-security-event-key' : '');
  if (!ENVIRONMENTS.has(environment)) throw new Error('Security environment is not configured');
  if (!AUDIENCE_PATTERN.test(audience)) throw new Error('Token audience is not configured');
  if (hmacKey.length < 32) throw new Error('Security event HMAC key is not configured');
  return { environment, audience, hmacKey };
}

export async function assertDatabaseEnvironment(sql, env = process.env) {
  const context = getSecurityContext(env);
  const [database] = await sql`SELECT environment FROM application_environment WHERE singleton = TRUE`;
  if (!database || database.environment !== context.environment) {
    const error = new Error('Database environment mismatch');
    error.code = 'DATABASE_ENVIRONMENT_MISMATCH';
    throw error;
  }
  return context;
}

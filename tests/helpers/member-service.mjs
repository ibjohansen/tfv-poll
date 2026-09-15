import { loadModule } from './load-module.mjs';
import * as memberUtils from '../../lib/member-self-service-utils.js';
import * as comments from '../../lib/member-comments.js';
import * as securityConfig from '../../lib/security-config.js';
import * as securityEvents from '../../lib/security-events.js';
import { normalizeEmail } from '../../lib/mailer-service.js';

export const memberTestEnvironment = { NODE_ENV: 'test', APP_ENVIRONMENT: 'development', TOKEN_AUDIENCE: 'tfv-integration', SECURITY_EVENT_HMAC_KEY: 'synthetic-integration-test-hmac-key-only' };

export function loadMemberService(sql, mail = null) {
  const blocked = () => { throw new Error('Unexpected external service in member integration test'); };
  return loadModule('lib/member-self-service.js', {
    './db.js': { getSql: () => sql }, './member-self-service-utils.js': memberUtils,
    './member-comments.js': comments, './security-config.js': securityConfig, './security-events.js': securityEvents,
    './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async (permission) => { if (permission !== 'members') throw new Error('Forbidden'); return { email: 'admin@example.test' }; } },
    './email-templates.js': { renderEmailChangeConfirmationEmail: blocked, renderEmailChangeNoticeEmail: blocked,
      renderMemberAccessEmail: mail ? ({ actionUrl }) => ({ subject: 'Synthetic access', html: '', text: actionUrl }) : blocked,
      renderMembershipVerificationEmail: blocked },
    './mailer-service.js': { normalizeEmail, sendEmail: mail || blocked,
      getMailerSendSuppressions: mail ? async () => [] : blocked, isSuppressedRecipient: mail ? () => false : blocked },
    './matrikkel-client.js': { MatrikkelClient: class { constructor() { blocked(); } }, addressProperty: blocked, lookupAddress: blocked, officialAddress: blocked },
  }, { process: { env: memberTestEnvironment } });
}

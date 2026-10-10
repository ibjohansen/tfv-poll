const memberIdPattern=/^\d{1,18}$/;

export function annualDuesTestMemberIds(env=process.env){
 return new Set(String(env.INVOICE_EMAIL_TEST_MEMBER_IDS||'').split(',').map(value=>value.trim()).filter(value=>memberIdPattern.test(value)));
}

export function annualDuesSendingMode(env=process.env){
 if(env.INVOICE_EMAIL_ENABLED!=='true'||env.APP_ENVIRONMENT!=='production'||env.MAILERSEND_BULK_ENABLED!=='true'||env.MAILERSEND_ENABLED!=='true')return 'off';
 if(env.INVOICE_EMAIL_MODE==='live')return 'live';
 if(env.INVOICE_EMAIL_MODE==='test'&&annualDuesTestMemberIds(env).size)return 'test';
 return 'off';
}

export const annualDuesSendingEnabled=(env=process.env)=>annualDuesSendingMode(env)!=='off';

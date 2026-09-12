import test from 'node:test';
import assert from 'node:assert/strict';
import { adminPermissions, isAllowedAdmin, isAllowedMatrikkelSync, isAuthConfigured } from '../lib/admin-policy.js';
const tenant='11111111-1111-1111-1111-111111111111';
const env={AUTH_MICROSOFT_ENTRA_ID_TENANT_ID:tenant,ADMIN_EMAILS:'leder@turufjellvel.no,ib@turufjellvel.no'};
test('admin requires configured tenant, exact organization domain and non-empty allowlist',()=>{
 assert.equal(isAllowedAdmin({email:'leder@turufjellvel.no',tenantId:tenant},env),true);
 for(const identity of [null,{}, {email:'leder@turufjellvel.no',tenantId:'other'}, {email:'leder@evil.no',tenantId:tenant}, {email:'leder@turufjellvel.no.evil.no',tenantId:tenant}]) assert.equal(isAllowedAdmin(identity,env),false);
 assert.equal(isAllowedAdmin({email:'leder@turufjellvel.no',tenantId:tenant},{}),false);
 assert.equal(isAllowedAdmin({email:'leder@turufjellvel.no',tenantId:tenant},{...env,ADMIN_EMAILS:''}),false);
});
test('allowlist can further restrict administrators',()=>{
 const config={...env,ADMIN_EMAILS:'styret@turufjellvel.no'};
 assert.equal(isAllowedAdmin({email:'leder@turufjellvel.no',tenantId:tenant},config),false);
 assert.equal(isAllowedAdmin({email:'STYRET@turufjellvel.no',tenantId:tenant},config),true);
});
test('missing credentials and common/multitenant configuration are not enabled',()=>{
 assert.equal(isAuthConfigured({}),false);
 assert.equal(isAuthConfigured({...env,AUTH_SECRET:'secret',AUTH_MICROSOFT_ENTRA_ID_ID:'client',AUTH_MICROSOFT_ENTRA_ID_SECRET:'client-secret'}),true);
 assert.equal(isAuthConfigured({...env,AUTH_MICROSOFT_ENTRA_ID_TENANT_ID:'common'}),false);
});
test('configured Entra roles are required and mapped to least-privilege permissions',()=>{
 const config={...env,ADMIN_REQUIRED_ROLES:'TFV.MemberAdmin,TFV.SecurityAudit'};
 const memberAdmin={email:'leder@turufjellvel.no',tenantId:tenant,roles:['TFV.MemberAdmin']};
 assert.equal(isAllowedAdmin(memberAdmin,config),true);
 assert.equal(adminPermissions(memberAdmin,config).has('members'),true);
 assert.equal(adminPermissions(memberAdmin,config).has('audit'),false);
 assert.equal(isAllowedAdmin({...memberAdmin,roles:['TFV.Unknown']},config),false);
 assert.equal(isAuthConfigured({...config,ADMIN_REQUIRED_ROLES:'TFV.Unknown',AUTH_SECRET:'secret',AUTH_MICROSOFT_ENTRA_ID_ID:'client',AUTH_MICROSOFT_ENTRA_ID_SECRET:'client-secret'}),false);
});
test('matrikkel sync has a separate email role without restricting ordinary admins',()=>{
 const config={...env,MATRIKKEL_SYNC_EMAILS:'ib@turufjellvel.no, data@turufjellvel.no'};
 assert.equal(isAllowedAdmin({email:'leder@turufjellvel.no',tenantId:tenant},config),true);
 assert.equal(isAllowedMatrikkelSync({email:'leder@turufjellvel.no',tenantId:tenant},config),false);
 assert.equal(isAllowedMatrikkelSync({email:'IB@turufjellvel.no',tenantId:tenant},config),true);
 assert.equal(isAllowedMatrikkelSync({email:'ib@evil.no',tenantId:tenant},config),false);
 assert.equal(isAllowedMatrikkelSync({email:'ib@turufjellvel.no',tenantId:tenant},env),false);
 assert.equal(isAllowedMatrikkelSync({email:'ib@turufjellvel.no',tenantId:tenant},{...env,MATRIKKEL_SYNC_EMAILS:''}),false);
});

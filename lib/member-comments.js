export const MEMBER_COMMENT_MAX_LENGTH = 2000;

export function normalizeMemberComment(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > MEMBER_COMMENT_MAX_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw new Error('Invalid member data');
  }
  return value.replaceAll('\r\n', '\n').trim() || null;
}

import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { mockMembers } from '../data/mock-members.js';
import { isMockMode } from './mock-store.js';
import { attachSharedContactGroups, memberContactEmails } from './member-contact-groups.js';

const sortColumns = {
  h_number: "NULLIF(regexp_replace(h_number, '[^0-9]', '', 'g'), '')::numeric",
  street_address: 'street_address',
  title_holder: 'title_holder',
  primary_contact_email: 'primary_contact_email',
};

function hNumberGroup(value) {
  const normalized = String(value || '').trim();
  if (/^\d+$/.test(normalized)) return 0;
  if (/^SPG\s+H\s*\d+$/i.test(normalized)) return 1;
  return 2;
}

function hasIncompleteContact(member) {
  return !String(member.primary_contact_name || '').trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(member.primary_contact_email || '').trim());
}

async function sharedContacts(sql, members) {
  const emails = [...new Set(members.flatMap(memberContactEmails))];
  if (!emails.length) return attachSharedContactGroups(members);
  const related = await sql`
    SELECT id, h_number, street_address, primary_contact_name, primary_contact_email, other_contact_emails
    FROM members WHERE deleted_at IS NULL AND (
      lower(btrim(primary_contact_email)) = ANY(${emails}::text[])
      OR EXISTS (SELECT 1 FROM unnest(other_contact_emails) AS email WHERE lower(btrim(email)) = ANY(${emails}::text[]))
    )
  `;
  return attachSharedContactGroups(members, related);
}

export async function getAdminMembers(search = '', requestedPage = 1, sort = 'h_number', direction = 'asc', incompleteContact = false, hasComment = false, options = {}) {
  await requirePermission('members');
  const pageSize = 25;
  const sortColumn = sortColumns[sort] || sortColumns.h_number;
  const sortDirection = direction === 'desc' ? 'DESC' : 'ASC';
  const membershipStatus = ['member', 'exempt'].includes(options.membershipStatus) ? options.membershipStatus : '';
  const hamletId = /^[1-9][0-9]{0,15}$/.test(String(options.hamletId)) ? String(options.hamletId) : null;
  const groupId = /^[1-9][0-9]{0,15}$/.test(String(options.groupId)) ? String(options.groupId) : null;
  const sharing = ['allowed', 'opted_out'].includes(options.turufjellAsSharing) ? options.turufjellAsSharing : '';
  if (isMockMode()) {
    const matches = mockMembers.filter((m) => Object.values(m).join(' ').toLowerCase().includes(search.toLowerCase()) &&
      (!incompleteContact || hasIncompleteContact(m)) && (!hasComment || String(m.admin_comment || '').trim()) &&
      (!membershipStatus || (m.membership_status || 'member') === membershipStatus) &&
      (!sharing || Boolean(m.turufjell_as_sharing_opt_out) === (sharing === 'opted_out')) &&
      (!hamletId || String(m.hamlet_id) === hamletId) && (!groupId || m.email_group_ids?.map(String).includes(groupId)));
    const collator = new Intl.Collator('nb', { numeric: true, sensitivity: 'base' });
    matches.sort((left, right) => {
      if (sort === 'h_number') {
        const groupDifference = hNumberGroup(left.h_number) - hNumberGroup(right.h_number);
        if (groupDifference) return groupDifference;
      }
      const result = collator.compare(String(left[sort] || ''), String(right[sort] || ''));
      return sortDirection === 'DESC' ? -result : result;
    });
    const total = matches.length;
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    return { members: attachSharedContactGroups(matches.slice((page - 1) * pageSize, page * pageSize), mockMembers), total, page, pageSize, mock: true };
  }
  const sql = getSql();
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM members
    WHERE strpos(lower(concat_ws(' ', h_number, cadastral_number, section_number, street_address,
      title_holder, primary_contact_name, primary_contact_email,
      array_to_string(other_contact_emails, ' '), admin_comment)), lower(${search})) > 0
      AND deleted_at IS NULL
      AND (${membershipStatus} = '' OR membership_status = ${membershipStatus})
      AND (${hamletId}::bigint IS NULL OR hamlet_id = ${hamletId})
      AND (${groupId}::bigint IS NULL OR id IN (SELECT member_id FROM member_email_group_members WHERE group_id = ${groupId}))
      AND (${sharing} = '' OR turufjell_as_sharing_opt_out = (${sharing} = 'opted_out'))
      AND (${incompleteContact}::boolean = FALSE OR NULLIF(btrim(COALESCE(primary_contact_name, '')), '') IS NULL
        OR NULLIF(btrim(COALESCE(primary_contact_email, '')), '') IS NULL
        OR btrim(primary_contact_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
      AND (${hasComment}::boolean = FALSE OR NULLIF(btrim(COALESCE(admin_comment, '')), '') IS NOT NULL)
  `;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(count / pageSize)));
  const members = await sql.query(
    `SELECT id, h_number, cadastral_number, section_number, street_address, title_holder,
      registration_date, primary_contact_name, primary_contact_email,
      other_contact_emails, admin_comment, membership_status, hamlet_id,
      turufjell_as_sharing_opt_out, turufjell_as_sharing_opt_out_updated_at,
      (SELECT name FROM member_hamlets WHERE id = members.hamlet_id AND deleted_at IS NULL) AS hamlet_name
    FROM members
    WHERE strpos(lower(concat_ws(' ', h_number, cadastral_number, section_number, street_address,
      title_holder, primary_contact_name, primary_contact_email,
      array_to_string(other_contact_emails, ' '), admin_comment)), lower($1)) > 0
      AND deleted_at IS NULL
      AND ($6::text = '' OR membership_status = $6)
      AND ($7::bigint IS NULL OR hamlet_id = $7)
      AND ($8::bigint IS NULL OR id IN (SELECT member_id FROM member_email_group_members WHERE group_id = $8))
      AND ($9::text = '' OR turufjell_as_sharing_opt_out = ($9 = 'opted_out'))
      AND ($4::boolean = FALSE OR NULLIF(btrim(COALESCE(primary_contact_name, '')), '') IS NULL
        OR NULLIF(btrim(COALESCE(primary_contact_email, '')), '') IS NULL
        OR btrim(primary_contact_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
      AND ($5::boolean = FALSE OR NULLIF(btrim(COALESCE(admin_comment, '')), '') IS NOT NULL)
    ORDER BY ${sort === 'h_number' ? `
      CASE
        WHEN trim(h_number) ~ '^\\d+$' THEN 0
        WHEN trim(h_number) ~* '^SPG\\s+H\\s*\\d+$' THEN 1
        ELSE 2
      END,
      ${sortColumn} ${sortDirection} NULLS LAST,
      lower(h_number) ${sortDirection},
    ` : `${sortColumn} ${sortDirection} NULLS LAST,`} id
    LIMIT $2 OFFSET $3`,
    [search, pageSize, (page - 1) * pageSize, incompleteContact, hasComment, membershipStatus, hamletId, groupId, sharing],
  );
  return { members: await sharedContacts(sql, members), total: count, page, pageSize, mock: false, sort, direction: sortDirection.toLowerCase() };
}

export async function getAdminMemberById(id) {
  await requirePermission('members');
  if (!/^\d+$/.test(String(id || '')) || isMockMode()) return null;
  const sql = getSql();
  const [member] = await sql`
    SELECT id, h_number, cadastral_number, section_number, street_address, title_holder,
      registration_date, primary_contact_name, primary_contact_email,
      other_contact_emails, admin_comment, membership_status, hamlet_id,
      turufjell_as_sharing_opt_out, turufjell_as_sharing_opt_out_updated_at,
      (SELECT name FROM member_hamlets WHERE id = members.hamlet_id AND deleted_at IS NULL) AS hamlet_name
    FROM members WHERE id = ${id} AND deleted_at IS NULL
  `;
  return member ? (await sharedContacts(sql, [member]))[0] : null;
}

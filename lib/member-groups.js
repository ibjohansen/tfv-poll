import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';

const tables = { hamlet: 'member_hamlets', email: 'member_email_groups' };
function idValue(value) {
  if (!/^[1-9][0-9]{0,15}$/.test(String(value))) throw new Error('Invalid member selection');
  return String(value);
}
export function normalizeGroupInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !tables[input.kind]) throw new Error('Invalid member selection');
  if (!['create', 'rename', 'delete', 'add', 'remove'].includes(input.action)) throw new Error('Invalid member selection');
  const id = input.action === 'create' ? null : idValue(input.id);
  let name = null;
  if (['create', 'rename'].includes(input.action)) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100 || /[\x00-\x1f\x7f]/.test(input.name)) throw new Error('Invalid member selection');
    name = input.name.trim();
  }
  if (!Array.isArray(input.memberIds || [])) throw new Error('Invalid member selection');
  const memberIds = [...new Set((input.memberIds || []).map(idValue))];
  if (memberIds.length > 10000) throw new Error('Invalid member selection');
  const allMatching = input.allMatching === true;
  const search = typeof input.search === 'string' ? input.search.trim().slice(0, 200) : '';
  const membershipStatus = input.membershipStatus || '';
  if (!['', 'member', 'exempt'].includes(membershipStatus)) throw new Error('Invalid member selection');
  if (['add', 'remove'].includes(input.action) && !memberIds.length && !allMatching) throw new Error('No members selected');
  return { kind: input.kind, action: input.action, id, name, memberIds, allMatching, search, membershipStatus };
}

export async function getMemberGroups() {
  await requirePermission('members');
  if (isMockMode()) return [];
  const sql = getSql();
  return sql`
    WITH groups AS (
      SELECT id, name, 'hamlet' AS kind FROM member_hamlets WHERE deleted_at IS NULL
      UNION ALL SELECT id, name, 'email' AS kind FROM member_email_groups WHERE deleted_at IS NULL
    ), links AS (
      SELECT hamlet_id AS group_id, 'hamlet' AS kind, id AS member_id FROM members WHERE hamlet_id IS NOT NULL AND deleted_at IS NULL
      UNION ALL SELECT group_id, 'email', member_id FROM member_email_group_members
    )
    SELECT g.id, g.name, g.kind, count(DISTINCT m.id)::int AS plot_count,
      count(DISTINCT m.id) FILTER (WHERE m.membership_status = 'member')::int AS member_count,
      count(DISTINCT lower(btrim(e.email))) FILTER (WHERE m.membership_status = 'member'
        AND btrim(e.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')::int AS email_count
    FROM groups g LEFT JOIN links l ON l.group_id = g.id AND l.kind = g.kind
    LEFT JOIN members m ON m.id = l.member_id AND m.deleted_at IS NULL
    LEFT JOIN LATERAL unnest(ARRAY[m.primary_contact_email] || COALESCE(m.other_contact_emails, ARRAY[]::text[])) e(email) ON TRUE
    GROUP BY g.id, g.name, g.kind ORDER BY g.kind, lower(g.name), g.id
  `;
}

export async function changeMemberGroup(input) {
  const user = await requirePermission('members');
  const values = normalizeGroupInput(input);
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const sql = getSql();
  const actor = user.email.toLowerCase();
  // The table name is selected exclusively from this closed, local map.
  const table = tables[values.kind];
  if (values.action === 'create' || values.action === 'rename') {
    const query = values.action === 'create'
      ? `INSERT INTO ${table} (name) VALUES ($1) RETURNING id, name`
      : `UPDATE ${table} SET name = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id, name`;
    const params = values.action === 'create' ? [values.name] : [values.name, values.id];
    const rows = await sql.query(`WITH changed AS (${query}), audited AS (
      INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      SELECT 'admin_actions', id::text, 'INSERT', $${params.length + 1}, jsonb_build_object('action', $${params.length + 2}::text,
        'kind', $${params.length + 3}::text, 'group_id', id, 'name', name) FROM changed
    ) SELECT * FROM changed`, [...params, actor, `group_${values.action}`, values.kind]);
    if (!rows.length) throw new Error('Member not found');
    return rows[0];
  }
  // Serialize group deletion and membership changes; lock plots in ascending
  // order so simultaneous moves between hamlets cannot duplicate membership.
  const selection = `deleted_at IS NULL AND (
    id = ANY($1::bigint[]) OR ($2::boolean AND strpos(lower(concat_ws(' ', h_number, cadastral_number, section_number,
      street_address, title_holder, primary_contact_name, primary_contact_email, array_to_string(other_contact_emails, ' '), admin_comment)), lower($3)) > 0
      AND ($4::text = '' OR membership_status = $4)))`;
  const params = [values.memberIds, values.allMatching, values.search, values.membershipStatus];
  const typedArgs = 'args AS (SELECT $1::bigint[], $2::boolean, $3::text, $4::text, $5::bigint)';
  const target = values.action === 'delete'
    ? values.kind === 'hamlet' ? 'hamlet_id = $5' : 'id IN (SELECT member_id FROM member_email_group_members WHERE group_id = $5)'
    : selection;
  const commands = [
    sql.query(`SELECT id FROM ${table} WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [values.id]),
    sql.query(`WITH ${typedArgs} SELECT id FROM members WHERE ${target} ORDER BY id FOR UPDATE`, [...params, values.id]),
  ];
  let change;
  if (values.kind === 'hamlet') {
    const remove = values.action !== 'add';
    change = `UPDATE members SET hamlet_id = ${remove ? 'NULL' : '$5'}, last_changed_by = $6
      WHERE ${target} ${remove ? 'AND hamlet_id = $5' : ''}
        AND EXISTS (SELECT 1 FROM member_hamlets WHERE id = $5 AND deleted_at IS NULL) RETURNING id`;
  } else if (values.action === 'add') {
    change = `INSERT INTO member_email_group_members (group_id, member_id)
      SELECT $5, id FROM members WHERE ${selection}
        AND EXISTS (SELECT 1 FROM member_email_groups WHERE id = $5 AND deleted_at IS NULL)
      ON CONFLICT DO NOTHING RETURNING member_id AS id`;
  } else {
    change = `DELETE FROM member_email_group_members WHERE group_id = $5
      AND member_id IN (SELECT id FROM members WHERE ${target})
      AND EXISTS (SELECT 1 FROM member_email_groups WHERE id = $5 AND deleted_at IS NULL) RETURNING member_id AS id`;
  }
  commands.push(sql.query(`WITH ${typedArgs}, changed AS (${change}), audited AS (
    INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
    SELECT 'admin_actions', $5::text, 'INSERT', $6, jsonb_build_object('action', $7::text, 'kind', $8::text,
      'group_id', $5::bigint, 'count', count(*)) FROM changed
      HAVING EXISTS (SELECT 1 FROM ${table} WHERE id = $5 AND deleted_at IS NULL)
  ) SELECT count(*)::int AS changed_count FROM changed`, [...params, values.id, actor, `group_${values.action}`, values.kind]));
  if (values.action === 'delete') commands.push(sql.query(`UPDATE ${table} SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [values.id]));
  const result = await sql.transaction(commands);
  if (!result[0].length) throw new Error('Member not found');
  return result[2][0];
}

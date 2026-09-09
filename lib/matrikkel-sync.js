import { randomUUID } from 'node:crypto';
import { getSql } from './db.js';
import { requireMatrikkelSync } from './admin-access.js';
import { isMockMode } from './mock-store.js';
import { MatrikkelClient, addressProperty, findA5Entry, loadA5Entries, lookupAddress, officialAddress } from './matrikkel-client.js';

const MAX_BATCH_SIZE = 10;
let resourcesPromise;

async function getResources() {
  if (!resourcesPromise) {
    resourcesPromise = (async () => {
      const client = new MatrikkelClient();
      await client.verifyAccess();
      return { client, a5Entries: await loadA5Entries() };
    })().catch((error) => { resourcesPromise = undefined; throw error; });
  }
  return resourcesPromise;
}

function cleanError(error) {
  const message = error instanceof Error ? error.message : 'Ukjent feil';
  return message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 1000);
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function joined(values) {
  const result = unique(values);
  return result.length ? result.join(' / ') : null;
}

export function isMatrikkelConfigured(env = process.env) {
  return Boolean(env.API_MATRIKKEL_BASE_URL && env.API_MATRIKKEL_USR && env.API_MATRIKKEL_PWD);
}

export async function createMatrikkelRun({ hNumber = null } = {}) {
  const user = await requireMatrikkelSync();
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!isMatrikkelConfigured()) throw new Error('Matrikkel API not configured');
  const filter = hNumber === null || hNumber === '' ? null : String(hNumber).trim();
  if (filter && (filter.length > 50 || !/^[A-Za-z0-9/-]+$/.test(filter))) throw new Error('Invalid H-number');
  const id = randomUUID().replaceAll('-', '');
  const sql = getSql();
  const [run] = await sql`
    WITH created AS (
      INSERT INTO matrikkel_sync_runs
        (id, requested_by, h_number_filter, total_count, status, completed_at)
      SELECT ${id}, ${user.email.toLowerCase()}, ${filter}, selection.total_count,
        CASE WHEN selection.total_count = 0 THEN 'completed' ELSE 'pending' END,
        CASE WHEN selection.total_count = 0 THEN NOW() ELSE NULL END
      FROM (
        SELECT COUNT(*)::int AS total_count
        FROM members m
        WHERE m.deleted_at IS NULL AND (${filter}::text IS NULL OR m.h_number = ${filter})
      ) selection
      WHERE NOT EXISTS (
        SELECT 1 FROM matrikkel_sync_runs WHERE status IN ('pending', 'running') AND deleted_at IS NULL
      )
      RETURNING id, status, requested_by, h_number_filter, total_count, created_at
    ), backup AS (
      INSERT INTO matrikkel_sync_backups
        (run_id, member_id, cadastral_number, title_holder, registration_date)
      SELECT created.id, m.id, m.cadastral_number, m.title_holder, m.registration_date
      FROM created CROSS JOIN members m
      WHERE m.deleted_at IS NULL AND (${filter}::text IS NULL OR m.h_number = ${filter})
      RETURNING run_id
    )
    SELECT created.*, (SELECT COUNT(*)::int FROM backup) AS backup_count
    FROM created
  `;
  if (!run) throw new Error('Sync already running');
  return run;
}

export async function getMatrikkelRuns(limit = 10) {
  await requireMatrikkelSync();
  const sql = getSql();
  return sql`
    SELECT id, status, requested_by, h_number_filter, total_count, processed_count, updated_count,
      unchanged_count, review_count, error_count, error_message,
      created_at, started_at, completed_at
    FROM matrikkel_sync_runs
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${Math.min(Math.max(Number(limit) || 10, 1), 25)}
  `;
}

export async function getMatrikkelRun(id) {
  await requireMatrikkelSync();
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid run ID');
  const sql = getSql();
  const [run] = await sql`
    SELECT id, status, requested_by, h_number_filter, total_count, processed_count, updated_count,
      unchanged_count, review_count, error_count, error_message,
      created_at, started_at, completed_at,
      (SELECT COUNT(*)::int FROM matrikkel_sync_backups WHERE run_id = ${id}) AS backup_count
    FROM matrikkel_sync_runs WHERE id = ${id} AND deleted_at IS NULL
  `;
  if (!run) throw new Error('Run not found');
  const items = await sql`
    SELECT i.member_id, m.h_number, i.status, i.source_address, i.official_address,
      i.match_type, i.previous_values, i.proposed_values, i.details, i.message, i.completed_at
    FROM matrikkel_sync_items i
    JOIN members m ON m.id = i.member_id
    WHERE i.run_id = ${id} AND i.status IN ('review', 'error', 'skipped')
    ORDER BY CASE WHEN m.h_number ~ '^\d+$' THEN m.h_number::bigint END NULLS LAST, m.h_number
    LIMIT 200
  `;
  return { ...run, items };
}

async function claimMembers(sql, runId, batchSize) {
  return sql`
    WITH candidates AS (
      SELECT b.member_id, m.h_number, m.street_address, m.cadastral_number,
        m.title_holder, m.registration_date
      FROM matrikkel_sync_backups b
      JOIN matrikkel_sync_runs r ON r.id = b.run_id AND r.status IN ('pending', 'running')
      JOIN members m ON m.id = b.member_id
      LEFT JOIN matrikkel_sync_items i ON i.run_id = b.run_id AND i.member_id = b.member_id
      WHERE b.run_id = ${runId} AND i.member_id IS NULL
      ORDER BY m.id
      LIMIT ${batchSize}
    ), claimed AS (
      INSERT INTO matrikkel_sync_items (run_id, member_id, status, source_address, previous_values)
      SELECT ${runId}, c.member_id, 'processing', c.street_address,
        jsonb_build_object('cadastral_number', c.cadastral_number, 'title_holder', c.title_holder, 'registration_date', c.registration_date)
      FROM candidates c
      ON CONFLICT (run_id, member_id) DO NOTHING
      RETURNING member_id
    )
    SELECT c.* FROM candidates c JOIN claimed USING (member_id) ORDER BY c.member_id
  `;
}

async function finishItem(sql, runId, member, result) {
  const previous = {
    cadastral_number: member.cadastral_number,
    title_holder: member.title_holder,
    registration_date: member.registration_date,
  };
  const proposed = result.proposed || null;
  const changed = proposed && Object.keys(previous).some((key) => (previous[key] || null) !== (proposed[key] || null));
  const status = result.apply ? (changed ? 'updated' : 'unchanged') : result.status;
  const serializedProposed = proposed ? JSON.stringify(proposed) : null;
  const serializedDetails = result.details ? JSON.stringify(result.details) : null;
  if (result.apply && proposed) {
    const updated = await sql`
      WITH member_update AS (
        UPDATE members SET cadastral_number = ${proposed.cadastral_number},
          title_holder = ${proposed.title_holder}, registration_date = ${proposed.registration_date}
        WHERE id = ${member.member_id} AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM matrikkel_sync_runs
            WHERE id = ${runId} AND status IN ('pending', 'running')
          )
        RETURNING id
      )
      UPDATE matrikkel_sync_items SET status = ${status}, official_address = ${result.officialAddress},
        match_type = ${result.matchType}, proposed_values = ${serializedProposed}::jsonb,
        details = ${serializedDetails}::jsonb, message = ${result.message || null}, completed_at = NOW()
      WHERE run_id = ${runId} AND member_id = ${member.member_id} AND status = 'processing'
        AND EXISTS (SELECT 1 FROM member_update)
      RETURNING member_id
    `;
    if (!updated.length) {
      await sql`UPDATE matrikkel_sync_items SET status = 'error', message = 'Medlemmet finnes ikke lenger.', completed_at = NOW() WHERE run_id = ${runId} AND member_id = ${member.member_id} AND status = 'processing'`;
    }
  } else {
    await sql`
      UPDATE matrikkel_sync_items SET status = ${status}, official_address = ${result.officialAddress || null},
        match_type = ${result.matchType || null}, proposed_values = ${serializedProposed}::jsonb,
        details = ${serializedDetails}::jsonb, message = ${result.message || null}, completed_at = NOW()
      WHERE run_id = ${runId} AND member_id = ${member.member_id} AND status = 'processing'
        AND EXISTS (
          SELECT 1 FROM matrikkel_sync_runs
          WHERE id = ${runId} AND status IN ('pending', 'running')
        )
    `;
  }
}

async function updateRunCounts(sql, runId) {
  const [run] = await sql`
    WITH counts AS (
      SELECT COUNT(*) FILTER (WHERE status <> 'processing')::int AS processed,
        COUNT(*) FILTER (WHERE status = 'updated')::int AS updated,
        COUNT(*) FILTER (WHERE status = 'unchanged')::int AS unchanged,
        COUNT(*) FILTER (WHERE status = 'review')::int AS review,
        COUNT(*) FILTER (WHERE status IN ('error', 'skipped'))::int AS errors
      FROM matrikkel_sync_items WHERE run_id = ${runId}
    )
    UPDATE matrikkel_sync_runs r SET processed_count = counts.processed,
      updated_count = counts.updated, unchanged_count = counts.unchanged,
      review_count = counts.review, error_count = counts.errors,
      status = CASE WHEN counts.processed >= r.total_count THEN 'completed' ELSE 'running' END,
      completed_at = CASE WHEN counts.processed >= r.total_count THEN NOW() ELSE NULL END
    FROM counts WHERE r.id = ${runId}
    RETURNING r.*
  `;
  return run;
}

export async function approveMatrikkelItem(runId, memberId) {
  await requireMatrikkelSync();
  if (!/^[a-f0-9]{32}$/.test(runId) || !/^\d+$/.test(memberId)) throw new Error('Invalid item ID');
  const sql = getSql();
  const [item] = await sql`
    SELECT proposed_values FROM matrikkel_sync_items
    WHERE run_id = ${runId} AND member_id = ${memberId} AND status = 'review'
  `;
  const values = item?.proposed_values;
  if (!values || typeof values.cadastral_number !== 'string') throw new Error('Item not found');
  const updated = await sql`
    WITH member_update AS (
      UPDATE members SET cadastral_number = ${values.cadastral_number || null},
        title_holder = ${values.title_holder || null}, registration_date = ${values.registration_date || null}
      WHERE id = ${memberId} AND deleted_at IS NULL RETURNING id
    )
    UPDATE matrikkel_sync_items SET status = 'updated', message = 'Manuelt godkjent.', completed_at = NOW()
    WHERE run_id = ${runId} AND member_id = ${memberId}
      AND EXISTS (SELECT 1 FROM member_update)
    RETURNING member_id
  `;
  if (!updated.length) throw new Error('Item not found');
  return updateRunCounts(sql, runId);
}

export async function cancelMatrikkelRun(runId) {
  await requireMatrikkelSync();
  if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid run ID');
  const sql = getSql();
  const [run] = await sql`
    WITH cancelled AS (
      UPDATE matrikkel_sync_runs
      SET status = 'cancelled', completed_at = NOW(),
        error_message = 'Kjøringen ble stoppet manuelt.',
        processed_count = (
          SELECT COUNT(*)::int FROM matrikkel_sync_items
          WHERE run_id = ${runId}
        ),
        error_count = (
          SELECT COUNT(*)::int FROM matrikkel_sync_items
          WHERE run_id = ${runId} AND status IN ('processing', 'error', 'skipped')
        )
      WHERE id = ${runId} AND status IN ('pending', 'running')
      RETURNING id, status, requested_by, h_number_filter, total_count,
        processed_count, updated_count, unchanged_count, review_count,
        error_count, error_message, created_at, started_at, completed_at
    ), abandoned AS (
      UPDATE matrikkel_sync_items
      SET status = 'skipped', message = 'Kjøringen ble stoppet manuelt.', completed_at = NOW()
      WHERE run_id IN (SELECT id FROM cancelled) AND status = 'processing'
      RETURNING member_id
    )
    SELECT cancelled.*, (SELECT COUNT(*)::int FROM abandoned) AS abandoned_count
    FROM cancelled
  `;
  if (!run) {
    const [existing] = await sql`SELECT id, status FROM matrikkel_sync_runs WHERE id = ${runId}`;
    if (!existing) throw new Error('Run not found');
    throw new Error('Run already finished');
  }
  return run;
}

export async function deleteMatrikkelRunLog(runId) {
  await requireMatrikkelSync();
  if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid run ID');
  const sql = getSql();
  const [run] = await sql`
    UPDATE matrikkel_sync_runs
    SET deleted_at = NOW()
    WHERE id = ${runId} AND deleted_at IS NULL
      AND status IN ('completed', 'failed', 'cancelled')
    RETURNING id
  `;
  if (run) return run;
  const [existing] = await sql`SELECT id, status, deleted_at FROM matrikkel_sync_runs WHERE id = ${runId}`;
  if (!existing || existing.deleted_at) throw new Error('Run not found');
  throw new Error('Run still active');
}

export async function processMatrikkelRun(runId, options = {}) {
  if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid run ID');
  const sql = getSql();
  const [existing] = await sql`SELECT id, status FROM matrikkel_sync_runs WHERE id = ${runId} AND deleted_at IS NULL`;
  if (!existing) throw new Error('Run not found');
  if (['completed', 'failed', 'cancelled'].includes(existing.status)) return existing;
  await sql`UPDATE matrikkel_sync_runs SET status = 'running', started_at = COALESCE(started_at, NOW()) WHERE id = ${runId}`;
  const batchSize = Math.min(Math.max(Number(options.batchSize) || 5, 1), MAX_BATCH_SIZE);
  const members = await claimMembers(sql, runId, batchSize);
  if (!members.length) return updateRunCounts(sql, runId);

  try {
    const { client, a5Entries } = await getResources();
    const propertyCache = new Map();
    for (const member of members) {
      const [current] = await sql`SELECT status FROM matrikkel_sync_runs WHERE id = ${runId}`;
      if (!current || !['pending', 'running'].includes(current.status)) return current || existing;
      if (!member.street_address) {
        await finishItem(sql, runId, member, { status: 'skipped', message: 'Medlemmet mangler adresse.' });
        continue;
      }
      try {
        const address = await lookupAddress(member.street_address);
        const official = officialAddress(address.candidate);
        const a5 = findA5Entry(a5Entries, member.street_address, official);
        const property = a5?.underlying || addressProperty(address.candidate);
        if (property.gnr === '0' || property.bnr === '0') throw new Error('Adresseoppslaget mangler gårds- eller bruksnummer.');
        const cacheKey = JSON.stringify(property);
        let details = propertyCache.get(cacheKey);
        if (!details) {
          details = await client.lookupProperty(property);
          propertyCache.set(cacheKey, details);
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        const proposed = {
          cadastral_number: `${property.gnr}/${property.bnr}`,
          title_holder: joined(details.owners.map((owner) => owner.name)),
          registration_date: joined(details.owners.map((owner) => owner.dateFrom)),
        };
        const reviewReason = address.matchType === 'FUZZY'
          ? 'Tilnærmet adressetreff må godkjennes manuelt før oppdatering.'
          : !details.owners.length ? 'Ingen aktiv tinglyst hjemmelshaver ble funnet.' : '';
        await finishItem(sql, runId, member, {
          apply: !reviewReason,
          status: 'review',
          proposed,
          officialAddress: official,
          matchType: a5 ? `${address.matchType}_A5` : address.matchType,
          details: { matrikkelId: details.matrikkelId, owners: details.owners, a5: Boolean(a5) },
          message: reviewReason || null,
        });
      } catch (error) {
        await finishItem(sql, runId, member, { status: 'error', message: cleanError(error) });
      }
    }
    return updateRunCounts(sql, runId);
  } catch (error) {
    const message = cleanError(error);
    await sql`UPDATE matrikkel_sync_items SET status = 'error', message = ${message}, completed_at = NOW() WHERE run_id = ${runId} AND status = 'processing'`;
    await sql`
      UPDATE matrikkel_sync_runs SET status = 'failed', error_message = ${message}, completed_at = NOW(),
        processed_count = (SELECT COUNT(*)::int FROM matrikkel_sync_items WHERE run_id = ${runId} AND status <> 'processing'),
        error_count = (SELECT COUNT(*)::int FROM matrikkel_sync_items WHERE run_id = ${runId} AND status IN ('error', 'skipped'))
      WHERE id = ${runId}
    `;
    throw error;
  }
}

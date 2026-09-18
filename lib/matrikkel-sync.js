import { randomUUID } from 'node:crypto';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { MatrikkelClient, addressProperty, findA5Entry, loadA5Entries, lookupAddress, officialAddress } from './matrikkel-client.js';
import { parseCadastralNumber } from './member-self-service-utils.js';

const MAX_BATCH_SIZE = 10;
let resourcesPromise;

// Background functions must load without importing the Next/Auth runtime.
// Browser-admin entry points still enforce the exact same permission guard.
async function requireMatrikkelSync() {
  return (await import('./admin-access.js')).requireMatrikkelSync();
}

async function getResources(signal) {
  if (!resourcesPromise) {
    resourcesPromise = (async () => {
      const client = new MatrikkelClient();
      await client.verifyAccess({ signal });
      return { client, a5Entries: await loadA5Entries({ signal }) };
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

export async function createMatrikkelRun({ hNumber = null, memberId = null, memberIds = null } = {}) {
  const user = await requireMatrikkelSync();
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!isMatrikkelConfigured()) throw new Error('Matrikkel API not configured');
  const filter = hNumber === null || hNumber === '' ? null : String(hNumber).trim();
  if (filter && (filter.length > 50 || !/^[A-Za-z0-9/-]+$/.test(filter))) throw new Error('Invalid H-number');
  const singleMemberId = memberId === null || memberId === '' ? null : memberId;
  const hasBatchSelection = memberIds !== null && memberIds !== undefined;
  if (hasBatchSelection && (!Array.isArray(memberIds) || !memberIds.length || memberIds.length > 500 || singleMemberId !== null)) {
    throw new Error('Invalid member selection');
  }
  const requestedIds = hasBatchSelection ? memberIds : (singleMemberId === null ? [] : [singleMemberId]);
  const memberFilters = [...new Set(requestedIds.map((value) => String(value).trim()))];
  if (memberFilters.some((value) => !/^[1-9][0-9]{0,15}$/.test(value)) || (filter && memberFilters.length)) {
    throw new Error('Invalid member selection');
  }
  const memberSelection = memberFilters.length ? JSON.stringify(memberFilters) : null;
  const id = randomUUID().replaceAll('-', '');
  const sql = getSql();
  const [, createdRuns] = await sql.transaction([
    // Separate statements are intentional: after acquiring the lock the next
    // READ COMMITTED statement sees another starter's committed run. A lock
    // CTE inside the INSERT would retain the pre-wait snapshot and still race.
    sql`SELECT pg_advisory_xact_lock(hashtextextended('tfv:matrikkel:create', 0))`,
    sql`
    WITH created AS (
      INSERT INTO matrikkel_sync_runs
        (id, requested_by, h_number_filter, total_count, status, completed_at)
      SELECT ${id}, ${user.email.toLowerCase()}, COALESCE(${filter}, selection.selected_h_number), selection.total_count,
        CASE WHEN selection.total_count = 0 THEN 'completed' ELSE 'pending' END,
        CASE WHEN selection.total_count = 0 THEN NOW() ELSE NULL END
      FROM (
        SELECT COUNT(*)::int AS total_count,
          CASE WHEN ${memberSelection}::jsonb IS NULL OR COUNT(*) <> 1 THEN NULL ELSE MAX(m.h_number) END AS selected_h_number
        FROM members m
        WHERE m.deleted_at IS NULL
          AND (${filter}::text IS NULL OR m.h_number = ${filter})
          AND (${memberSelection}::jsonb IS NULL OR m.id IN (
            SELECT value::bigint FROM jsonb_array_elements_text(${memberSelection}::jsonb)
          ))
      ) selection
      WHERE (${memberSelection}::jsonb IS NULL OR selection.total_count = jsonb_array_length(${memberSelection}::jsonb))
        AND NOT EXISTS (
        SELECT 1 FROM matrikkel_sync_runs WHERE status IN ('pending', 'running') AND deleted_at IS NULL
      )
      RETURNING id, status, requested_by, h_number_filter, total_count, created_at
    ), backup AS (
      INSERT INTO matrikkel_sync_backups
        (run_id, member_id, cadastral_number, section_number, title_holder, registration_date)
      SELECT created.id, m.id, m.cadastral_number, m.section_number, m.title_holder, m.registration_date
      FROM created CROSS JOIN members m
      WHERE m.deleted_at IS NULL
        AND (${filter}::text IS NULL OR m.h_number = ${filter})
        AND (${memberSelection}::jsonb IS NULL OR m.id IN (
          SELECT value::bigint FROM jsonb_array_elements_text(${memberSelection}::jsonb)
        ))
      RETURNING run_id, member_id
    )
    SELECT created.*, (SELECT COUNT(*)::int FROM backup) AS backup_count,
      CASE WHEN (SELECT COUNT(*) FROM backup) = 1
        THEN (SELECT member_id::text FROM backup LIMIT 1) ELSE NULL END AS selected_member_id
    FROM created
  `]);
  const [run] = createdRuns;
  if (!run) {
    if (memberSelection) {
      const [selection] = await sql`SELECT COUNT(*)::int AS member_count FROM members
        WHERE id IN (SELECT value::bigint FROM jsonb_array_elements_text(${memberSelection}::jsonb))
          AND deleted_at IS NULL`;
      if (selection?.member_count !== memberFilters.length) throw new Error('Member not found');
    }
    throw new Error('Sync already running');
  }
  return run;
}

export async function getMatrikkelMemberOptions() {
  await requireMatrikkelSync();
  if (isMockMode()) return [];
  const sql = getSql();
  return sql`SELECT id::text AS id, h_number, street_address, cadastral_number
    FROM members
    WHERE deleted_at IS NULL
    ORDER BY CASE WHEN h_number ~ '^[0-9]+$' THEN h_number::bigint END NULLS LAST,
      h_number, street_address, id`;
}

export async function getMatrikkelRuns(limit = 10) {
  await requireMatrikkelSync();
  const sql = getSql();
  return sql`
    SELECT id, status, requested_by, h_number_filter, total_count, processed_count, updated_count,
      unchanged_count, review_count, error_count, error_message,
      run_type, scheduled_month, created_at, started_at, completed_at,
      CASE WHEN total_count = 1 THEN (
        SELECT member_id::text FROM matrikkel_sync_backups WHERE run_id = matrikkel_sync_runs.id LIMIT 1
      ) ELSE NULL END AS selected_member_id
    FROM matrikkel_sync_runs
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${Math.trunc(Math.min(Math.max(Number(limit) || 10, 1), 25))}
  `;
}

export async function failPendingMatrikkelRun(runId) {
  await requireMatrikkelSync();
  if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid run ID');
  const sql = getSql();
  // Et uklart nettverkssvar kan komme etter at worker allerede startet.
  // Den betingede oppdateringen må aldri stoppe en slik kjøring eller
  // overskrive en samtidig kansellering. Snapshot og medlemsdata beholdes.
  const [failed] = await sql`
    UPDATE matrikkel_sync_runs
    SET status = 'failed', completed_at = NOW(),
      error_message = 'Bakgrunnsjobben kunne ikke startes. Kontroller Netlify-konfigurasjonen og prøv igjen.'
    WHERE id = ${runId} AND status = 'pending' AND started_at IS NULL AND deleted_at IS NULL
    RETURNING id, status, requested_by, h_number_filter, total_count,
      processed_count, updated_count, unchanged_count, review_count,
      error_count, error_message, created_at, started_at, completed_at
  `;
  if (failed) return failed;
  const [current] = await sql`SELECT id, status FROM matrikkel_sync_runs WHERE id = ${runId} AND deleted_at IS NULL`;
  if (!current) throw new Error('Run not found');
  return current;
}

export async function getMatrikkelRun(id) {
  await requireMatrikkelSync();
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid run ID');
  const sql = getSql();
  const [run] = await sql`
    SELECT id, status, requested_by, h_number_filter, total_count, processed_count, updated_count,
      unchanged_count, review_count, error_count, error_message,
      run_type, scheduled_month, created_at, started_at, completed_at,
      (SELECT COUNT(*)::int FROM matrikkel_sync_backups WHERE run_id = ${id}) AS backup_count,
      CASE WHEN total_count = 1 THEN (
        SELECT member_id::text FROM matrikkel_sync_backups WHERE run_id = ${id} LIMIT 1
      ) ELSE NULL END AS selected_member_id
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

async function claimMembers(sql, runId, batchSize, workerToken) {
  return sql`
    WITH candidates AS (
      SELECT b.member_id, m.h_number, m.street_address, m.cadastral_number, m.section_number,
        m.title_holder, m.registration_date
      FROM matrikkel_sync_backups b
      JOIN matrikkel_sync_runs r ON r.id = b.run_id AND r.status IN ('pending', 'running')
      JOIN members m ON m.id = b.member_id
      LEFT JOIN matrikkel_sync_items i ON i.run_id = b.run_id AND i.member_id = b.member_id
      WHERE b.run_id = ${runId} AND (i.member_id IS NULL OR (i.status = 'processing' AND i.attempt_count < 3))
        AND r.worker_token = ${workerToken} AND r.worker_lease_expires_at > NOW()
      ORDER BY m.id
      LIMIT ${batchSize}
    ), claimed AS (
      INSERT INTO matrikkel_sync_items (run_id, member_id, status, source_address, previous_values, worker_token)
      SELECT ${runId}, c.member_id, 'processing', c.street_address,
        jsonb_build_object('cadastral_number', c.cadastral_number, 'section_number', c.section_number, 'title_holder', c.title_holder, 'registration_date', c.registration_date), ${workerToken}
      FROM candidates c
      ON CONFLICT (run_id, member_id) DO UPDATE
      SET worker_token = EXCLUDED.worker_token, started_at = NOW()
      WHERE matrikkel_sync_items.status = 'processing' AND matrikkel_sync_items.attempt_count < 3
      RETURNING member_id
    )
    SELECT c.* FROM candidates c JOIN claimed USING (member_id) ORDER BY c.member_id
  `;
}

async function finishItem(sql, runId, member, result, workerToken) {
  const previous = {
    cadastral_number: member.cadastral_number,
    section_number: member.section_number,
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
      WITH active_run AS MATERIALIZED (
        SELECT id FROM matrikkel_sync_runs WHERE id = ${runId}
          AND status = 'running' AND worker_token = ${workerToken}
          AND worker_lease_expires_at > NOW() FOR UPDATE
      ), member_update AS (
        UPDATE members SET cadastral_number = ${proposed.cadastral_number}, section_number = ${proposed.section_number},
          title_holder = ${proposed.title_holder}, registration_date = ${proposed.registration_date},
          last_changed_by = ${result.changedBy || 'matrikkel-sync'}
        WHERE id = ${member.member_id} AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM active_run
          )
        RETURNING id
      )
      UPDATE matrikkel_sync_items SET status = ${status}, official_address = ${result.officialAddress},
        match_type = ${result.matchType}, proposed_values = ${serializedProposed}::jsonb,
        details = ${serializedDetails}::jsonb, message = ${result.message || null}, completed_at = NOW()
      WHERE run_id = ${runId} AND member_id = ${member.member_id} AND status = 'processing'
        AND worker_token = ${workerToken}
        AND EXISTS (SELECT 1 FROM member_update)
      RETURNING member_id
    `;
    if (!updated.length) {
      await sql`UPDATE matrikkel_sync_items SET status = 'error', message = 'Medlemmet finnes ikke lenger.', completed_at = NOW()
        WHERE run_id = ${runId} AND member_id = ${member.member_id} AND status = 'processing' AND worker_token = ${workerToken}
          AND EXISTS (SELECT 1 FROM matrikkel_sync_runs WHERE id = ${runId} AND status = 'running'
            AND worker_token = ${workerToken} AND worker_lease_expires_at > NOW())`;
    }
  } else {
    await sql`
      WITH active_run AS MATERIALIZED (
        SELECT id FROM matrikkel_sync_runs WHERE id = ${runId}
          AND status = 'running' AND worker_token = ${workerToken}
          AND worker_lease_expires_at > NOW() FOR UPDATE
      )
      UPDATE matrikkel_sync_items SET status = ${status}, official_address = ${result.officialAddress || null},
        match_type = ${result.matchType || null}, proposed_values = ${serializedProposed}::jsonb,
        details = ${serializedDetails}::jsonb, message = ${result.message || null}, completed_at = NOW()
      WHERE run_id = ${runId} AND member_id = ${member.member_id} AND status = 'processing'
        AND worker_token = ${workerToken}
        AND EXISTS (
          SELECT 1 FROM active_run
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
    FROM counts WHERE r.id = ${runId} AND r.status IN ('pending', 'running', 'completed') AND r.deleted_at IS NULL
    RETURNING r.*
  `;
  if (run) return run;
  const [current] = await sql`SELECT id, status FROM matrikkel_sync_runs WHERE id = ${runId}`;
  return current;
}

export async function approveMatrikkelItem(runId, memberId) {
  const user = await requireMatrikkelSync();
  if (!/^[a-f0-9]{32}$/.test(runId) || !/^\d+$/.test(memberId)) throw new Error('Invalid item ID');
  const sql = getSql();
  const updated = await sql`
    WITH locked_run AS MATERIALIZED (
      SELECT id FROM matrikkel_sync_runs WHERE id = ${runId} AND deleted_at IS NULL FOR UPDATE
    ), item AS MATERIALIZED (
      SELECT i.member_id, i.proposed_values FROM matrikkel_sync_items i JOIN locked_run r ON r.id = i.run_id
      WHERE i.member_id = ${memberId} AND i.status = 'review'
        AND jsonb_typeof(i.proposed_values->'cadastral_number') = 'string'
      FOR UPDATE OF i
    ), member_update AS (
      UPDATE members m SET cadastral_number = NULLIF(item.proposed_values->>'cadastral_number', ''),
        section_number = NULLIF(item.proposed_values->>'section_number', ''),
        title_holder = NULLIF(item.proposed_values->>'title_holder', ''), registration_date = NULLIF(item.proposed_values->>'registration_date', ''),
        last_changed_by = ${user.email.toLowerCase()}
      FROM item WHERE m.id = item.member_id AND m.deleted_at IS NULL RETURNING m.id
    ), reviewed AS (
      UPDATE matrikkel_sync_items SET status = 'updated', message = 'Manuelt godkjent.', completed_at = NOW()
      WHERE run_id = ${runId} AND member_id = ${memberId} AND status = 'review'
        AND EXISTS (SELECT 1 FROM member_update) RETURNING member_id
    ), activity AS (
      INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      SELECT 'admin_actions', ${runId}, 'INSERT', ${user.email.toLowerCase()},
        jsonb_build_object('action', 'matrikkel_approve', 'run_id', ${runId}::text, 'member_id', member_id::text)
      FROM reviewed RETURNING id
    )
    SELECT reviewed.member_id FROM reviewed WHERE EXISTS (SELECT 1 FROM activity)
  `;
  if (!updated.length) throw new Error('Item not found');
  return updateRunCounts(sql, runId);
}

export async function cancelMatrikkelRun(runId) {
  const user = await requireMatrikkelSync();
  if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid run ID');
  const sql = getSql();
  const [, cancelledRows] = await sql.transaction([
    sql`SELECT id FROM matrikkel_sync_runs WHERE id = ${runId} FOR UPDATE`,
    sql`
    WITH cancelled AS (
      UPDATE matrikkel_sync_runs
      SET status = 'cancelled', completed_at = NOW(), worker_token = NULL, worker_lease_expires_at = NULL,
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
    ), activity AS (
      INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      SELECT 'admin_actions', id, 'INSERT', ${user.email.toLowerCase()},
        jsonb_build_object('action', 'matrikkel_cancel', 'run_id', id)
      FROM cancelled RETURNING id
    )
    SELECT cancelled.*, (SELECT COUNT(*)::int FROM abandoned) AS abandoned_count
    FROM cancelled WHERE EXISTS (SELECT 1 FROM activity)
  `]);
  const [run] = cancelledRows;
  if (!run) {
    const [existing] = await sql`SELECT id, status FROM matrikkel_sync_runs WHERE id = ${runId}`;
    if (!existing) throw new Error('Run not found');
    throw new Error('Run already finished');
  }
  return run;
}

export async function deleteMatrikkelRunLog(runId) {
  const user = await requireMatrikkelSync();
  if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid run ID');
  const sql = getSql();
  const [run] = await sql`
    WITH hidden AS (
      UPDATE matrikkel_sync_runs SET deleted_at = NOW()
      WHERE id = ${runId} AND deleted_at IS NULL AND status IN ('completed', 'failed', 'cancelled')
      RETURNING id
    ), activity AS (
      INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      SELECT 'admin_actions', id, 'INSERT', ${user.email.toLowerCase()},
        jsonb_build_object('action', 'matrikkel_hide', 'run_id', id)
      FROM hidden RETURNING id
    )
    SELECT hidden.id FROM hidden WHERE EXISTS (SELECT 1 FROM activity)
  `;
  if (run) return run;
  const [existing] = await sql`SELECT id, status, deleted_at FROM matrikkel_sync_runs WHERE id = ${runId}`;
  if (!existing || existing.deleted_at) throw new Error('Run not found');
  throw new Error('Run still active');
}

export async function processMatrikkelRun(runId, options = {}) {
  if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid run ID');
  const sql = getSql();
  const [existing] = await sql`SELECT id, status, requested_by, run_type FROM matrikkel_sync_runs WHERE id = ${runId} AND deleted_at IS NULL`;
  if (!existing) throw new Error('Run not found');
  if (['completed', 'failed', 'cancelled'].includes(existing.status)) return existing;
  const workerToken = randomUUID();
  const [started] = await sql`
    UPDATE matrikkel_sync_runs SET status = 'running', started_at = COALESCE(started_at, NOW()),
      worker_token = ${workerToken}, worker_lease_expires_at = NOW() + INTERVAL '16 minutes'
    WHERE id = ${runId} AND status IN ('pending', 'running') AND deleted_at IS NULL
      AND (worker_token IS NULL OR worker_lease_expires_at IS NULL OR worker_lease_expires_at <= NOW())
    RETURNING id
  `;
  if (!started) {
    const [current] = await sql`SELECT id, status FROM matrikkel_sync_runs WHERE id = ${runId}`;
    return { ...(current || existing), workerBusy: (current || existing).status === 'running' };
  }
  const batchSize = Math.trunc(Math.min(Math.max(Number(options.batchSize) || 5, 1), MAX_BATCH_SIZE));
  const signal = AbortSignal.timeout(Math.max(1, Math.min(11 * 60_000, (options.deadline || Date.now() + 11 * 60_000) - Date.now())));
  try {
    await sql`UPDATE matrikkel_sync_items SET status = 'error', message = 'Avbrutt behandling etter tre forsøk. Start en ny kontrollert kjøring.', completed_at = NOW()
      WHERE run_id = ${runId} AND status = 'processing' AND attempt_count >= 3`;
    const members = await claimMembers(sql, runId, batchSize, workerToken);
    if (!members.length) return await updateRunCounts(sql, runId);
    const { client, a5Entries } = await getResources(signal);
    const propertyCache = new Map();
    for (const member of members) {
      const [current] = await sql`SELECT status FROM matrikkel_sync_runs WHERE id = ${runId}`;
      if (!current || !['pending', 'running'].includes(current.status)) return current || existing;
      if (signal.aborted || (options.deadline && Date.now() >= options.deadline)) break;
      const [attempt] = await sql`UPDATE matrikkel_sync_items SET attempt_count = attempt_count + 1
        WHERE run_id = ${runId} AND member_id = ${member.member_id} AND status = 'processing' AND worker_token = ${workerToken}
          AND EXISTS (SELECT 1 FROM matrikkel_sync_runs WHERE id = ${runId} AND worker_token = ${workerToken}
            AND worker_lease_expires_at > NOW() AND status = 'running') RETURNING member_id`;
      if (!attempt) break;
      if (!member.street_address) {
        await finishItem(sql, runId, member, { status: 'skipped', message: 'Medlemmet mangler adresse.' }, workerToken);
        continue;
      }
      try {
        const expectedProperty = parseCadastralNumber(member.cadastral_number);
        const address = await lookupAddress(member.street_address, expectedProperty, { signal });
        const official = officialAddress(address.candidate);
        const a5 = findA5Entry(a5Entries, member.street_address, official);
        const property = { ...(a5?.underlying || addressProperty(address.candidate)), snr: member.section_number || '0' };
        if (property.gnr === '0' || property.bnr === '0') throw new Error('Adresseoppslaget mangler gårds- eller bruksnummer.');
        const cacheKey = JSON.stringify(property);
        let details = propertyCache.get(cacheKey);
        if (!details) {
          details = await client.lookupProperty(property, { signal });
          propertyCache.set(cacheKey, details);
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        const proposed = {
          cadastral_number: `${property.gnr}/${property.bnr}`,
          section_number: property.snr === '0' ? null : property.snr,
          title_holder: joined(details.owners.map((owner) => owner.name)),
          registration_date: joined(details.owners.map((owner) => owner.dateFrom)),
        };
        const proposedChange = Object.keys(proposed).some((key) => (member[key] || null) !== (proposed[key] || null));
        const monthlyReview = existing.run_type === 'monthly' && proposedChange;
        const reviewReason = address.matchType === 'FUZZY'
          ? 'Tilnærmet adressetreff må godkjennes manuelt før oppdatering.'
          : !details.owners.length ? 'Ingen aktiv tinglyst hjemmelshaver ble funnet.'
            : monthlyReview ? 'Den månedlige kontrollen fant endringer som må godkjennes manuelt.' : '';
        await finishItem(sql, runId, member, {
          apply: existing.run_type !== 'monthly' && !reviewReason,
          status: reviewReason ? 'review' : 'unchanged',
          proposed,
          officialAddress: official,
          matchType: a5 ? `${address.matchType}_A5` : address.matchType,
          details: { matrikkelId: details.matrikkelId, owners: details.owners, a5: Boolean(a5) },
          changedBy: existing.requested_by,
          message: reviewReason || null,
        }, workerToken);
      } catch (error) {
        if (signal.aborted) break;
        await finishItem(sql, runId, member, { status: 'error', message: cleanError(error) }, workerToken);
      }
    }
    return await updateRunCounts(sql, runId);
  } catch (error) {
    const message = cleanError(error);
    await sql`UPDATE matrikkel_sync_items SET status = 'error', message = ${message}, completed_at = NOW()
      WHERE run_id = ${runId} AND status = 'processing' AND worker_token = ${workerToken}`;
    await sql`
      UPDATE matrikkel_sync_runs SET status = 'failed', error_message = ${message}, completed_at = NOW(),
        processed_count = (SELECT COUNT(*)::int FROM matrikkel_sync_items WHERE run_id = ${runId} AND status <> 'processing'),
        error_count = (SELECT COUNT(*)::int FROM matrikkel_sync_items WHERE run_id = ${runId} AND status IN ('error', 'skipped'))
      WHERE id = ${runId} AND status IN ('pending', 'running') AND deleted_at IS NULL
        AND worker_token = ${workerToken}
    `;
    throw error;
  } finally {
    await sql`UPDATE matrikkel_sync_runs SET worker_token = NULL, worker_lease_expires_at = NULL
      WHERE id = ${runId} AND worker_token = ${workerToken}`;
  }
}

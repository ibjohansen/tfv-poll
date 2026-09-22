// Project the complete dataset before slicing for infinite-scroll display.
export function mailNote(entry, t) {
  const detail = entry.diagnostic;
  if (detail) return [detail.provider_message || detail.message,
    detail.http_status ? `HTTP ${detail.http_status}` : null,
    detail.provider_code || detail.network_code || detail.code,
    ...(detail.validation_errors || []).flatMap(({ field, messages }) => messages.map((message) => `${field}: ${message}`)),
    detail.error_id ? `${t('errorId')}: ${detail.error_id}` : null,
  ].filter(Boolean).join(' · ');
  return entry.failure_reason ? t(`receiptReasons.${entry.failure_reason}`, {}, entry.failure_reason) : '—';
}

export function mailRows(entries, t) {
  return entries.map((entry) => ({ ...entry, cells: {
    member: entry.h_number || t('unknown'), address: entry.street_address || '—',
    type: t(`mailKinds.${entry.kind}`, {}, entry.kind), recipient: entry.recipient_email || entry.recipient_domain || '—',
    status: entry.status === 'suppressed' ? t('notSent') : t(`statuses.${entry.status}`, {}, entry.status),
    note: mailNote(entry, t),
  } }));
}

export function selectMailRows(rows, { tile = 'all', type = '', status = '', note = '', sort = null } = {}, locale = 'nb') {
  let result = rows.filter((row) => tile === 'all'
    || (['invitations', 'properties'].includes(tile) && row.kind === 'invitation' && row.accepted)
    || (tile === 'failed' && ['failed', 'bounced'].includes(row.status))
    || (tile === 'suppressed' && row.status === 'suppressed'));
  result = result.filter((row) => (!type || row.kind === type) && (!status || row.status === status)
    && (!note.trim() || row.cells.note.toLocaleLowerCase(locale).includes(note.trim().toLocaleLowerCase(locale))));
  if (tile === 'properties') {
    // Input is newest-first. Keep one representative per property matching all filters.
    const seen = new Set();
    result = result.filter((row) => {
      if (row.member_id == null || seen.has(String(row.member_id))) return false;
      seen.add(String(row.member_id)); return true;
    });
  }
  if (sort) {
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    result.sort((a, b) => (sort.direction === 'desc' ? -1 : 1)
      * collator.compare(a.cells[sort.key] || '', b.cells[sort.key] || '') || a.id.localeCompare(b.id));
  }
  return result;
}

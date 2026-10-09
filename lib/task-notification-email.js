const TITLES = {
  membership: 'Innmelding av ny tomt', ownership_transfer: 'Eierskifte',
  profile_update: 'Kommentar fra medlem', map_import: 'Oppfølging av kartimport',
  matrikkel: 'Månedlig matrikkelkontroll', activity_map: 'Månedlig kontroll av aktivitetskart',
};
const FIELD_NAMES = { h_number: 'H-nummer', street_address: 'Gateadresse', cadastral_number: 'Gårds- og bruksnummer',
  primary_contact_name: 'Kontaktperson', primary_contact_email: 'Hoved-e-post', other_contact_emails: 'Andre e-postadresser' };

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function renderTaskNotificationEmail(task, baseUrl) {
  const title = TITLES[task.kind];
  if (!title) throw new Error('INVALID_TASK_SNAPSHOT');
  const details = [];
  if (task.h_number) details.push(`H-nummer: ${task.h_number}`);
  if (task.street_address) details.push(`Adresse: ${task.street_address}`);
  if (task.kind === 'membership') details.push(task.status === 'pending_verification'
    ? 'E-postadressen var ikke bekreftet da oppgaven ble opprettet.' : 'E-postadressen er bekreftet.');
  if (task.scheduled_month) details.push(`Kontrollmåned: ${String(task.scheduled_month).slice(0, 7)}`);
  if (task.kind === 'matrikkel') {
    details.push(`Til vurdering: ${Number(task.review_count || 0)}. Feil: ${Number(task.error_count || 0)}. Kontrollerte tomter: ${Number(task.total_count || 0)}.`);
  }
  if (task.kind === 'activity_map') {
    details.push(`Nye: ${Number(task.new_count || 0)}. Mulige treff: ${Number(task.matched_count || 0)}. Endrede: ${Number(task.changed_count || 0)}. Manglende: ${Number(task.missing_count || 0)}.`);
  }
  if (['failed', 'cancelled'].includes(task.status)) details.push(task.status === 'failed' ? 'Kontrollen feilet og må følges opp.' : 'Kontrollen ble avbrutt og må følges opp.');
  if (task.changed_fields?.length) details.push(`Endrede felt: ${task.changed_fields.map((name) => FIELD_NAMES[name] || name).join(', ')}`);
  if (task.comment) details.push(`Kommentar: ${String(task.comment).replace(/^MAP_IMPORT_TASK:\s*/, '').slice(0, 500)}`);
  details.push(`Oppgave-ID: ${task.source_id}`);
  const url = new URL('/admin/inbox', baseUrl).href;
  const summary = details.join('\n');
  return { subject: `Ny oppgave: ${title}`, text: `Turufjell Vel\n\n${title}\n\n${summary}\n\nÅpne oppgavelisten: ${url}\n\nStatus kan ha blitt endret siden varselet ble opprettet.`,
    html: `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head><body style="font-family:Arial,sans-serif;color:#493F39"><main style="max-width:620px;margin:auto;padding:24px"><h1 style="font-size:24px">${escapeHtml(title)}</h1><p style="white-space:pre-line;line-height:1.6">${escapeHtml(summary)}</p><p><a href="${escapeHtml(url)}">Åpne oppgavelisten i Turufjell Vel</a></p><p style="font-size:13px">Status kan ha blitt endret siden varselet ble opprettet.</p></main></body></html>` };
}

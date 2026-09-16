import Link from 'next/link';
import { auditPageHref } from '@/lib/audit-filters';

const tableLabels = {
  members: 'Medlem',
  member_requests: 'Henvendelse',
  member_profile_updates: 'Medlemsretting',
  surveys: 'Undersøkelse',
  survey_responses: 'Undersøkelsessvar',
  cms_pages: 'Webside',
  cms_attachments: 'Webvedlegg',
  admin_actions: 'Administrativ handling',
  email_campaigns: 'E-postkampanje', email_deliveries: 'Testmail',
  newsletter_campaigns: 'Nyhetsbrevkampanje',
};
const operationLabels = { INSERT: 'Opprettet', UPDATE: 'Endret', DELETE: 'Slettet' };
const fieldLabels = {
  h_number: 'H-nummer', cadastral_number: 'Gårds-/bruksnummer', section_number: 'Seksjonsnummer',
  street_address: 'Gateadresse', title_holder: 'Hjemmelshaver', registration_date: 'Tinglysningsdato',
  primary_contact_name: 'Hovedkontakt', primary_contact_email: 'Hoved-e-post', other_contact_emails: 'Andre e-poster',
  admin_comment: 'Internt notat', title: 'Tittel', slug: 'URL', intro: 'Ingress', body: 'Innhold', category: 'Kategori',
  status: 'Status', is_open: 'Åpen', ends_on: 'Svarfrist', questions: 'Spørsmål', answers: 'Svar',
  deleted_at: 'Slettet tidspunkt', published_at: 'Publisert tidspunkt', sort_order: 'Rekkefølge', original_filename: 'Filnavn',
  action: 'Handling', count: 'Antall poster', scope: 'Utvalg', survey_id: 'Undersøkelses-ID',
  run_id: 'Matrikkelkjøring', member_id: 'Medlems-ID',
  comment: 'Kommentar fra medlem', requested_comment: 'Kommentar fra medlem', comment_read_at: 'Kommentar lest',
  membership_status: 'Medlemsstatus', hamlet_id: 'Grend-ID', body_rich_text: 'Formatert innhold',
  kind: 'Type', group_id: 'Gruppering-ID', name: 'Navn',
  reviewed: 'Kontrollert i kartet', vertices: 'Polygonhjørner', area_m2: 'Areal (m²)', version: 'Versjon',
};

function formatDate(value) {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nei';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function changedFields(entry) {
  const before = entry.before_value || {};
  const after = entry.after_value || {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort((left, right) => (fieldLabels[left] || left).localeCompare(fieldLabels[right] || right, 'nb'));
}

function entityLabel(entry) {
  const value = entry.after_value || entry.before_value || {};
  if (value.action?.startsWith('hamlet_polygon_')) return `Grend · ${value.name} · ${value.action === 'hamlet_polygon_clear' ? 'polygon fjernet' : 'polygon lagret'}`;
  if (value.action === 'newsletter_saved') return 'Nyhetsbrevutkast lagret';
  if (value.action === 'newsletter_queued') return 'Nyhetsbrev bestilt';
  if (entry.table_name === 'newsletter_campaigns') return value.action === 'campaign_started' ? 'Nyhetsbrev startet' : 'Nyhetsbrev avsluttet';
  if (['email_campaigns', 'email_deliveries'].includes(entry.table_name)) return ({ campaign_created: 'Kampanje opprettet', campaign_started: 'Utsending startet', campaign_finished: 'Kampanje avsluttet', testmail_requested: 'Testmail bestilt', testmail_finished: 'Testmail behandlet' })[value.action] || 'E-posthendelse';
  if (entry.table_name === 'admin_actions' && value.action?.startsWith('group_')) return `${value.kind === 'hamlet' ? 'Grend' : 'E-postgruppe'} · ${({ group_create: 'opprettet', group_rename: 'navn endret', group_add: 'tomter tilordnet', group_remove: 'tomter fjernet', group_delete: 'slettet' })[value.action] || value.action}`;
  if (entry.table_name === 'members') return value.h_number ? `Medlem ${value.h_number}` : `Medlem #${entry.row_id}`;
  if (entry.table_name === 'member_requests') return `${value.request_type === 'membership' ? 'Innmelding' : 'Eierskifte'} ${value.h_number || `#${entry.row_id}`}`;
  if (entry.table_name === 'surveys') return value.title || `Undersøkelse #${entry.row_id}`;
  if (entry.table_name === 'survey_responses') return `Svar #${entry.row_id}`;
  if (entry.table_name === 'cms_pages') return value.title || `Webside #${entry.row_id}`;
  if (entry.table_name === 'admin_actions') return ({ member_export: 'Medlemsregister eksportert', survey_results_export: 'Undersøkelsesresultater eksportert', map_export: 'Kart-/registerrapport eksportert',
    matrikkel_approve: 'Matrikkelforslag godkjent', matrikkel_cancel: 'Matrikkelkjøring stoppet', matrikkel_hide: 'Matrikkelkjøring skjult' })[value.action] || 'Administrativ handling';
  return value.original_filename || `Vedlegg #${entry.row_id}`;
}

function entityHref(entry) {
  if (entry.after_value?.action?.startsWith('hamlet_polygon_')) return '/admin/map';
  if (entry.after_value?.newsletter_id) return '/admin/members/newsletters';
  if (['email_campaigns', 'email_deliveries'].includes(entry.table_name)) return '/admin/surveys';
  if (entry.table_name === 'admin_actions' && entry.after_value?.action?.startsWith('group_')) return '/admin/members/groups';
  if (entry.table_name === 'admin_actions' && entry.after_value?.action?.startsWith('matrikkel_')) return '/admin/members/matrikkel';
  if (entry.table_name === 'members') return `/admin/members?member=${encodeURIComponent(entry.row_id)}`;
  if (entry.table_name === 'member_requests') return '/admin/inbox';
  if (entry.table_name === 'member_profile_updates') return '/admin/inbox';
  if (['surveys', 'survey_responses'].includes(entry.table_name)) return '/admin/surveys';
  if (['cms_pages', 'cms_attachments'].includes(entry.table_name)) return '/admin/web';
  return null;
}

export default function AdminAuditLog({ data, filters, tables }) {
  const { actor, table, q, from, to, operation, status } = filters;
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  return <section className="admin-audit" aria-labelledby="audit-title">
    <div className="admin-section-header"><div><p className="eyebrow">Revisjonsspor</p><h2 id="audit-title">Brukerendringer</h2><p>Endringer i sentrale data og eksport fra administrasjonen. Hemmelige tilgangsverdier er utelatt.</p></div><span>{data.total}</span></div>
    <form className="admin-audit-filters" action="/admin/audit">
      <label>Bruker<select name="actor" defaultValue={actor}><option value="">Alle brukere</option>{data.actors.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Område<select name="table" defaultValue={table}><option value="">Alle områder</option>{tables.map((value) => <option value={value} key={value}>{tableLabels[value]}</option>)}</select></label>
      <label>Søk<input name="q" type="search" defaultValue={q} maxLength={200} placeholder="Navn, e-post, H-nummer eller endret verdi" /></label>
      <label>Endringstype<select name="operation" defaultValue={operation}><option value="">Alle typer</option>{Object.entries(operationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Status<input name="status" defaultValue={status} maxLength={80} placeholder="F.eks. pending eller approved" /></label>
      <label>Fra dato<input name="from" type="date" defaultValue={from} max={to || '9998-12-31'} /></label>
      <label>Til dato<input name="to" type="date" defaultValue={to} min={from || undefined} max="9998-12-31" /></label>
      <button className="primary-button" type="submit">Filtrer</button>
      {(actor || table || q || from || to || operation || status) && <Link href="/admin/audit">Nullstill</Link>}
    </form>
    {!data.entries.length ? <p className="admin-inbox-empty">Ingen endringer samsvarer med filteret.</p> : <ol className="admin-audit-list">{data.entries.map((entry) => {
      const fields = changedFields(entry);
      const href = entityHref(entry);
      return <li key={entry.id}>
        <div className="admin-audit-summary"><div><span className={`admin-audit-operation is-${entry.operation.toLowerCase()}`}>{entry.table_name === 'admin_actions' ? 'Utført' : operationLabels[entry.operation]}</span><strong>{tableLabels[entry.table_name]} · {entityLabel(entry)}</strong></div><time dateTime={entry.changed_at}>{formatDate(entry.changed_at)}</time></div>
        <p>Utført av <strong>{entry.changed_by}</strong>{fields.length && entry.table_name !== 'admin_actions' ? ` · ${fields.length} endrede felt` : ''}</p>
        <div className="admin-audit-actions">{href && <Link href={href}>Åpne posten</Link>}<details><summary>Vis full logg</summary><div className="admin-audit-values">{fields.map((field) => <section key={field}><h3>{fieldLabels[field] || field}</h3><div><div><span>Før</span><pre>{formatValue(entry.before_value?.[field])}</pre></div><div><span>Etter</span><pre>{formatValue(entry.after_value?.[field])}</pre></div></div></section>)}</div></details></div>
      </li>;
    })}</ol>}
    {pageCount > 1 && <nav className="admin-pagination" aria-label="Sider i endringsloggen">{data.page > 1 && <Link href={auditPageHref(data.page - 1, filters)}>Forrige</Link>}<span>Side {data.page} av {pageCount}</span>{data.page < pageCount && <Link href={auditPageHref(data.page + 1, filters)}>Neste</Link>}</nav>}
  </section>;
}

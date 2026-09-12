import Link from 'next/link';

const tableLabels = {
  members: 'Medlem',
  member_requests: 'Henvendelse',
  surveys: 'Undersøkelse',
  survey_responses: 'Undersøkelsessvar',
  cms_pages: 'Webside',
  cms_attachments: 'Webvedlegg',
};
const operationLabels = { INSERT: 'Opprettet', UPDATE: 'Endret', DELETE: 'Slettet' };
const fieldLabels = {
  h_number: 'H-nummer', cadastral_number: 'Gårds-/bruksnummer', section_number: 'Seksjonsnummer',
  street_address: 'Gateadresse', title_holder: 'Hjemmelshaver', registration_date: 'Tinglysningsdato',
  primary_contact_name: 'Hovedkontakt', primary_contact_email: 'Hoved-e-post', other_contact_emails: 'Andre e-poster',
  admin_comment: 'Internt notat', title: 'Tittel', slug: 'URL', intro: 'Ingress', body: 'Innhold', category: 'Kategori',
  status: 'Status', is_open: 'Åpen', ends_on: 'Svarfrist', questions: 'Spørsmål', answers: 'Svar',
  deleted_at: 'Slettet tidspunkt', published_at: 'Publisert tidspunkt', sort_order: 'Rekkefølge', original_filename: 'Filnavn',
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
  if (entry.table_name === 'members') return value.h_number ? `Medlem ${value.h_number}` : `Medlem #${entry.row_id}`;
  if (entry.table_name === 'member_requests') return `${value.request_type === 'membership' ? 'Innmelding' : 'Eierskifte'} ${value.h_number || `#${entry.row_id}`}`;
  if (entry.table_name === 'surveys') return value.title || `Undersøkelse #${entry.row_id}`;
  if (entry.table_name === 'survey_responses') return `Svar #${entry.row_id}`;
  if (entry.table_name === 'cms_pages') return value.title || `Webside #${entry.row_id}`;
  return value.original_filename || `Vedlegg #${entry.row_id}`;
}

function entityHref(entry) {
  if (entry.table_name === 'members') return `/admin/members?member=${encodeURIComponent(entry.row_id)}`;
  if (entry.table_name === 'member_requests') return '/admin/inbox';
  if (['surveys', 'survey_responses'].includes(entry.table_name)) return '/admin/surveys';
  if (['cms_pages', 'cms_attachments'].includes(entry.table_name)) return '/admin/web';
  return null;
}

function pageHref(page, actor, table) {
  const query = new URLSearchParams({ ...(actor ? { actor } : {}), ...(table ? { table } : {}), page: String(page) });
  return `/admin/audit?${query}`;
}

export default function AdminAuditLog({ data, actor, table, tables }) {
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  return <section className="admin-audit" aria-labelledby="audit-title">
    <div className="admin-section-header"><div><p className="eyebrow">Revisjonsspor</p><h2 id="audit-title">Brukerendringer</h2><p>Før- og etterverdier for sentrale data. Hemmelige tilgangsverdier er utelatt.</p></div><span>{data.total}</span></div>
    <form className="admin-audit-filters" action="/admin/audit">
      <label>Bruker<select name="actor" defaultValue={actor}><option value="">Alle brukere</option>{data.actors.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Område<select name="table" defaultValue={table}><option value="">Alle områder</option>{tables.map((value) => <option value={value} key={value}>{tableLabels[value]}</option>)}</select></label>
      <button className="primary-button" type="submit">Filtrer</button>
      {(actor || table) && <Link href="/admin/audit">Nullstill</Link>}
    </form>
    {!data.entries.length ? <p className="admin-inbox-empty">Ingen endringer samsvarer med filteret.</p> : <ol className="admin-audit-list">{data.entries.map((entry) => {
      const fields = changedFields(entry);
      const href = entityHref(entry);
      return <li key={entry.id}>
        <div className="admin-audit-summary"><div><span className={`admin-audit-operation is-${entry.operation.toLowerCase()}`}>{operationLabels[entry.operation]}</span><strong>{tableLabels[entry.table_name]} · {entityLabel(entry)}</strong></div><time dateTime={entry.changed_at}>{formatDate(entry.changed_at)}</time></div>
        <p>Utført av <strong>{entry.changed_by}</strong>{fields.length ? ` · ${fields.length} endrede felt` : ''}</p>
        <div className="admin-audit-actions">{href && <Link href={href}>Åpne posten</Link>}<details><summary>Vis full logg</summary><div className="admin-audit-values">{fields.map((field) => <section key={field}><h3>{fieldLabels[field] || field}</h3><div><div><span>Før</span><pre>{formatValue(entry.before_value?.[field])}</pre></div><div><span>Etter</span><pre>{formatValue(entry.after_value?.[field])}</pre></div></div></section>)}</div></details></div>
      </li>;
    })}</ol>}
    {pageCount > 1 && <nav className="admin-pagination" aria-label="Sider i endringsloggen">{data.page > 1 && <Link href={pageHref(data.page - 1, actor, table)}>Forrige</Link>}<span>Side {data.page} av {pageCount}</span>{data.page < pageCount && <Link href={pageHref(data.page + 1, actor, table)}>Neste</Link>}</nav>}
  </section>;
}

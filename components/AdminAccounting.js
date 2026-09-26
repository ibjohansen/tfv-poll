'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Select from '@/components/Select';
import AccountingTable from '@/components/AccountingTable';
import AccountingChart from '@/components/AccountingChart';
import { useI18n } from '@/components/LocaleProvider';
import { accountingCategories, accountingCurrencies, accountingReference2025 } from '@/data/accounting';
import { accountingSummary, convertToOre, decimalString, decimalUnits } from '@/lib/accounting-validation';

const uuid = () => crypto.randomUUID().replaceAll('-', '');
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
const balanceGroups = [
  { title: 'balanceAssets', total: 'balanceAssetsTotal', entries: ['receivables', 'bank'] },
  { title: 'balanceEquityAndLiabilities', total: 'balanceEquityAndLiabilitiesTotal', entries: ['equity', 'suppliers', 'otherDebt'] },
];

function AccountingBalance({ t, money }) {
  return <div className="accounting-balance-grid">{balanceGroups.map((group) => {
    const total = group.entries.reduce((sum, key) => sum + accountingReference2025.balance[key], 0);
    return <section className="accounting-balance-column" key={group.title} aria-labelledby={`accounting-${group.title}`}>
      <h3 id={`accounting-${group.title}`}>{t(group.title)}</h3>
      <dl className="accounting-balance">{group.entries.map((key) => <div key={key}><dt>{t(`balance.${key}`)}</dt><dd>{money(accountingReference2025.balance[key])}</dd></div>)}
        <div className="accounting-balance-total"><dt>{t(group.total)}</dt><dd>{money(total)}</dd></div>
      </dl>
    </section>;
  })}</div>;
}

function settingsForm(settings) {
  return { year: settings.id, version: settings.version, annual_fee: decimalString(settings.annual_fee_ore), member_count: settings.member_count,
    budget: Object.fromEntries(Object.entries(settings.budget).map(([key, value]) => [key, decimalString(value)])),
    actual_income: Object.fromEntries(Object.entries(settings.actual_income).map(([key, value]) => [key, value === null ? '' : decimalString(value)])) };
}
function draftExpense(file, year, currentUserName) {
  const s = file?.suggestion ?? {};
  return { id: uuid(), amount: s.amount || '', currency: s.currency || (file ? '' : 'NOK'), exchange_rate: s.currency === 'NOK' || !file ? '1' : '',
    category: s.category || 'other', invoice_date: s.invoice_date || (!file && today().startsWith(String(year)) ? today() : ''),
    invoice_number: s.invoice_number || '', description: file?.original_filename.replace(/\.[^.]+$/, '') || '',
    attachment_ids: file ? [file.id] : [], receipt_note: '', notes: '', submitted_on: '', paid_on: '', reviewed: false,
    claimant_name: file ? file.uploaded_by || '' : currentUserName,
    warning: s.warning || '', suggestedSupplier: s.supplier || '' };
}
function draftAmount(entry) {
  try { return convertToOre(decimalUnits(entry.amount), decimalUnits(entry.exchange_rate, 6, 10000000000)); } catch { return null; }
}
function validDraftAmount(entry) {
  try { return decimalUnits(entry.amount) > 0; } catch { return false; }
}
function validDraftRate(entry) {
  if (!entry.currency) return true;
  try {
    const rate = decimalUnits(entry.exchange_rate, 6, 10000000000);
    return rate > 0 && (entry.currency !== 'NOK' || rate === 1000000);
  } catch { return false; }
}

export default function AdminAccounting({ initialData, canWrite, currentUserName = '' }) {
  const { t, formatLocale } = useI18n('accounting');
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState(initialData.settings.version ? 'overview' : 'budget');
  const [settings, setSettings] = useState(() => settingsForm(initialData.settings));
  const [drafts, setDrafts] = useState([]);
  const [supplier, setSupplier] = useState('');
  const [shared, setShared] = useState({ category: 'systems', currency: 'NOK', exchange_rate: '1' });
  const [editing, setEditing] = useState(null);
  const [files, setFiles] = useState(initialData.attachments);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [errors, setErrors] = useState([]);
  const [expenseValidationError, setExpenseValidationError] = useState(false);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState([]);
  const [statusDate, setStatusDate] = useState(today);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [feeImport, setFeeImport] = useState({ kind: 'invoiced', date: today(), file: null, preview: null });
  const editor = useRef(null);
  const batchId = useRef(null);
  const money = (value) => new Intl.NumberFormat(formatLocale, { style: 'currency', currency: 'NOK' }).format(value / 100);
  const summary = accountingSummary(data.settings, data.expenses);
  const expenseStatus = (expense) => expense.paid_on ? 'paid' : expense.submitted_on ? 'pending' : 'unsubmitted';
  const filtered = data.expenses.filter((expense) => (status === 'all' || expenseStatus(expense) === status)
    && `${expense.supplier} ${expense.claimant_name || ''} ${expense.invoice_number} ${expense.description} ${expense.invoice_date} ${expense.currency} ${decimalString(expense.amount_minor)} ${decimalString(expense.amount_ore)} ${t(`categories.${expense.category}`)} ${t(expenseStatus(expense))}`
      .toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selection = data.expenses.filter((expense) => selected.includes(expense.id));
  const exportEntries = selection.length ? selection : filtered;
  const pendingFiles = files.filter((file) => !file.expense_id && !drafts.some((entry) => entry.attachment_ids.includes(file.id)));
  const editPaid = editing && data.expenses.find((expense) => expense.id === editing)?.paid_on;

  async function api(body) {
    const response = await fetch('/api/admin/accounting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.code || 'unavailable');
    return result;
  }
  async function refresh() {
    const response = await fetch(`/api/admin/accounting?year=${data.year}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.code || 'unavailable');
    setData(result.data); setFiles(result.data.attachments); setSelected([]);
    return result.data;
  }
  async function action(callback, success = t('saved')) {
    if (busy) return;
    setBusy(true); setErrors([]); setNotice('');
    try { await callback(); setNotice(success); }
    catch (error) { setErrors([t(`errors.${error.message}`, {}, t('errors.unavailable'))]); }
    finally { setBusy(false); }
  }
  function updateDraft(id, values) {
    setDrafts((current) => current.map((entry) => entry.id === id ? { ...entry, ...values, ...('reviewed' in values ? {} : { reviewed: false }) } : entry));
  }
  function addFile(file) {
    setExpenseValidationError(false);
    if (editing) setDrafts((current) => current.map((entry) => ({ ...entry, attachment_ids: [...new Set([...entry.attachment_ids, file.id])], reviewed: false })));
    else {
      setDrafts((current) => current.some((entry) => entry.attachment_ids.includes(file.id)) ? current : [...current, draftExpense(file, data.year, currentUserName)]);
      setSupplier((current) => current || file.suggestion?.supplier || '');
    }
    batchId.current ||= uuid();
  }
  async function upload(event) {
    const chosen = Array.from(event.target.files || []);
    event.target.value = '';
    if (!chosen.length) return;
    if (chosen.length + (editing ? drafts[0]?.attachment_ids.length || 0 : drafts.length) > (editing ? 10 : 30)) { setErrors([t('errors.invalidBatch')]); return; }
    setBusy(true); setErrors([]); setNotice('');
    const failures = [];
    for (const [index, file] of chosen.entries()) {
      setProgress(t('scanning', { current: index + 1, total: chosen.length }));
      try {
        if (file.size > 3 * 1024 * 1024) throw new Error('invalidFile');
        const form = new FormData(); form.set('file', file); form.set('year', data.year);
        const response = await fetch('/api/admin/accounting/files', { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.code || 'unavailable');
        setFiles((current) => current.some((entry) => entry.id === result.file.id) ? current : [...current, result.file]);
        addFile(result.file);
      } catch (error) { failures.push(`${file.name}: ${t(`errors.${error.message}`, {}, t('errors.unavailable'))}`); }
    }
    setErrors(failures); setProgress(''); setBusy(false);
  }
  function editExpense(expense) {
    setExpenseValidationError(false);
    setEditing(expense.id); setSupplier(expense.supplier);
    setDrafts([{ ...expense, amount: decimalString(expense.amount_minor), exchange_rate: decimalString(expense.exchange_rate_million, 6),
      submitted_on: expense.submitted_on || '', paid_on: expense.paid_on || '', claimant_name: expense.claimant_name || '', reviewed: false,
      attachment_ids: files.filter((file) => file.expense_id === expense.id).map((file) => file.id) }]);
    setTimeout(() => editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }
  async function saveExpenses(event) {
    event.preventDefault();
    if (drafts.some((entry) => !validDraftAmount(entry) || !validDraftRate(entry))) {
      setExpenseValidationError(true);
      return;
    }
    setExpenseValidationError(false);
    await action(async () => {
      const entries = drafts.map((entry) => ({ ...entry, supplier }));
      if (editing) await api({ operation: 'expense', year: data.year, ...entries[0] });
      else {
        batchId.current ||= uuid();
        await api({ operation: 'batch', year: data.year, batch_id: batchId.current, entries });
      }
      setDrafts([]); setEditing(null); batchId.current = null;
      await refresh();
    });
  }
  async function saveStatus(type) {
    await action(async () => {
      await api({ operation: 'status', year: data.year, action: type, date: statusDate,
        entries: selection.map(({ id, version }) => ({ id, version })) });
      await refresh();
    });
  }
  async function downloadExpenses() {
    await action(async () => {
      const response = await fetch('/api/admin/accounting/export', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: data.year, ids: exportEntries.map((entry) => entry.id) }) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.code || 'unavailable');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `regnskapsforer-${data.year}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }, t('exported', { count: exportEntries.length }));
  }
  async function processFeeImport(apply) {
    if (busy || !feeImport.file) return;
    setBusy(true); setErrors([]); setNotice('');
    try {
      const form = new FormData();
      form.set('year', data.year); form.set('kind', feeImport.kind); form.set('date', feeImport.date);
      form.set('apply', String(apply)); form.set('file', feeImport.file);
      const response = await fetch('/api/admin/accounting/fees/import', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.code || 'unavailable');
      if (apply) {
        setNotice(t('feeImportApplied', { count: result.preview.matchedCount }));
        setFeeImport((current) => ({ ...current, file: null, preview: null }));
        await refresh();
      } else setFeeImport((current) => ({ ...current, preview: result.preview }));
    } catch (error) { setErrors([t(`errors.${error.message}`, {}, t('errors.unavailable'))]); }
    finally { setBusy(false); }
  }
  const total = drafts.reduce((sum, entry) => sum + (draftAmount(entry) ?? 0), 0);
  let dues = null;
  try { dues = decimalUnits(settings.annual_fee) * Number(settings.member_count); } catch {}

  return <div className="accounting-dashboard" aria-busy={busy}>
    <section className="accounting-panel accounting-heading"><div><p className="eyebrow">{t('meeting', { year: data.year + 1 })}</p><h2>{t('title')} {data.year}</h2><p>{t('introduction')} {t('calendar')}</p></div>
      <form className="accounting-year" action="/admin/regnskap"><label>{t('year')}<input name="year" type="number" min="2000" max="2099" required defaultValue={data.year} disabled={busy} /></label><button className="admin-button" disabled={busy}>{t('openYear')}</button></form>
    </section>
    {!canWrite && <p className="accounting-notice">{t('readOnly')}</p>}
    {!data.settings.version && <p className="accounting-notice">{t('noYear')}</p>}
    <div className="accounting-stats">{[['budgetIncome', summary.budgetIncome], ['budgetResult', summary.budgetIncome - summary.budgetExpenses], ['registeredCosts', summary.expenses], ['outstanding', summary.outstanding]].map(([label, value]) => <div className="accounting-stat" key={label}><span>{t(label)}</span><strong>{money(value)}</strong></div>)}</div>
    <div className="accounting-toolbar"><nav aria-label={t('title')}>{['overview', 'budget', 'receipts', 'fees'].map((key) => <button className="admin-button" key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{t(key)}</button>)}</nav><Link className="admin-button" href={`/admin/regnskap/arsmote?year=${data.year + 1}`} target="_blank">{t('report')}</Link></div>
    <div role="status" aria-live="polite">{progress || notice}</div>
    {errors.length > 0 && <div className="form-error" role="alert">{errors.map((error, index) => <p key={index}>{error}</p>)}<button type="button" className="admin-button" disabled={busy} onClick={() => action(refresh)}>{t('refresh')}</button></div>}

    {tab === 'overview' && <>
      <section className="accounting-panel"><h2>{t('overview')}</h2><AccountingChart settings={data.settings} expenses={data.expenses} /><AccountingTable settings={data.settings} expenses={data.expenses} />{!summary.incomeComplete && <p className="accounting-notice">{t('incomplete')}</p>}<p>{t('supplementary')}</p></section>
      <section className="accounting-panel"><h2>{t('balanceTitle')}</h2><AccountingBalance t={t} money={money} /><p>{t('balanceNote')}</p><p>{t('source')} {t('sourceNote')}</p></section>
    </>}

    {tab === 'budget' && <form className="accounting-panel" onSubmit={(event) => { event.preventDefault(); action(async () => { await api({ operation: 'year', ...settings }); const current = await refresh(); setSettings(settingsForm(current.settings)); }); }}>
      <fieldset disabled={!canWrite || busy}><legend>{data.settings.version ? t('budget') : t('proposal')}</legend><p>{data.year === 2026 ? t('baseline') : t('rolledForward')}</p>
        <div className="accounting-fields"><label>{t('members')}<input type="number" min="0" max="100000" required value={settings.member_count} onChange={(e) => setSettings({ ...settings, member_count: e.target.value })} /></label><label>{t('annualFee')}<input inputMode="decimal" required value={settings.annual_fee} onChange={(e) => setSettings({ ...settings, annual_fee: e.target.value })} /></label></div>
        <button type="button" className="admin-button" onClick={() => setSettings({ ...settings, member_count: data.memberCount })}>{t('useMembers', { count: data.memberCount })}</button><p>{t('snapshot')}</p><p className="accounting-emphasis">{t('expectedDues', { amount: dues === null || !Number.isFinite(dues) ? '–' : money(dues) })}</p>
        <div className="accounting-fields">{accountingCategories.filter((entry) => entry.id !== 'dues').map((category) => <label key={category.id}>{t(`categories.${category.id}`)} (NOK)<input inputMode="decimal" required value={settings.budget[category.id]} onChange={(e) => setSettings({ ...settings, budget: { ...settings.budget, [category.id]: e.target.value } })} /></label>)}</div>
        <h3>{t('actualIncome')}</h3><p>{t('incomeHelp')}</p><p>{t('paidMembers', { count: data.paidMemberCount })}</p><div className="accounting-fields">{accountingCategories.filter((entry) => entry.kind === 'income').map((category) => <label key={category.id}>{t(`categories.${category.id}`)}<input inputMode="decimal" placeholder={t('notEntered')} value={settings.actual_income[category.id]} onChange={(e) => setSettings({ ...settings, actual_income: { ...settings.actual_income, [category.id]: e.target.value } })} /></label>)}</div>
        <button className="primary-button" type="submit">{busy ? t('saving') : t('saveYear')}</button>
      </fieldset>
    </form>}

    {tab === 'fees' && <>
      <section className="accounting-panel"><h2>{t('feeStatusTitle')}</h2><p>{t('feeStatusHelp')}</p>
        <div className="accounting-stats accounting-fee-stats">
          <Link className="accounting-stat accounting-stat-link" href="/admin/members?membership=member"><span>{t('members')}</span><strong>{data.memberCount}</strong></Link>
          <Link className="accounting-stat accounting-stat-link" href="/admin/members?membership=exempt"><span>{t('exemptMembers')}</span><strong>{data.exemptMemberCount || 0}</strong></Link>
          {[['invoicedProperties', data.invoicedMemberCount || 0], ['paidProperties', data.paidMemberCount], ['collectionCandidates', data.collectionCandidateCount || 0]].map(([label, value]) => <div className="accounting-stat" key={label}><span>{t(label)}</span><strong>{value}</strong></div>)}
        </div>
      </section>
      {canWrite && <section className="accounting-panel"><h2>{t('feeImportTitle')}</h2><p>{t('feeImportHelp')}</p>
        <div className="accounting-fields"><label>{t('feeImportKind')}<Select value={feeImport.kind} onChange={(event) => setFeeImport({ ...feeImport, kind: event.target.value, preview: null })}><option value="invoiced">{t('importInvoiced')}</option><option value="paid">{t('importPaid')}</option></Select></label>
          {feeImport.kind === 'invoiced' && <label>{t('invoicedOn')}<input type="date" required min={`${data.year}-01-01`} max={`${data.year}-12-31`} value={feeImport.date} onChange={(event) => setFeeImport({ ...feeImport, date: event.target.value, preview: null })} /></label>}
          <label>{t('feeImportFile')}<input type="file" accept=".csv,text/csv" onChange={(event) => setFeeImport({ ...feeImport, file: event.target.files?.[0] || null, preview: null })} /></label></div>
        <button type="button" className="admin-button" disabled={busy || !feeImport.file} onClick={() => processFeeImport(false)}>{t('previewImport')}</button>
        {feeImport.preview && <div className="accounting-import-preview" role="status"><p>{t('feeImportPreview', feeImport.preview)}</p>
          {feeImport.preview.unmatchedCount > 0 && <><p className="form-error">{t('feeImportUnmatched', { count: feeImport.preview.unmatchedCount })}</p><ul>{feeImport.preview.unmatched.map((value) => <li key={value}>{value}</li>)}</ul></>}
          <button type="button" className="primary-button" disabled={busy || feeImport.preview.unmatchedCount > 0} onClick={() => processFeeImport(true)}>{t('applyFeeImport')}</button></div>}
      </section>}
      <section className="accounting-panel"><h2>{t('collectionTitle')}</h2><p>{t('collectionHelp')}</p>
        {canWrite ? <a className="admin-button" href={`/api/admin/accounting/fees/collection?year=${data.year}`}>{t('downloadCollection', { count: data.collectionCandidateCount || 0 })}</a> : <p>{t('collectionRestricted')}</p>}
      </section>
    </>}

    {tab === 'receipts' && <>
      {canWrite && <section className="accounting-panel" ref={editor}>
        <h2>{editing ? t('edit') : t('newExpense')}</h2><p>{t('checkSuggestion')}</p>
        <label className="accounting-upload">{t('upload')}<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={upload} disabled={busy || !data.settings.version} aria-describedby="accounting-upload-help" /></label><p id="accounting-upload-help">{t('uploadHelp')}</p>
        {!editing && <button type="button" className="admin-button" disabled={busy || !data.settings.version || drafts.length >= 30} onClick={() => { setExpenseValidationError(false); setDrafts([...drafts, draftExpense(null, data.year, currentUserName)]); batchId.current ||= uuid(); }}>{t('manual')}</button>}
        {pendingFiles.length > 0 && <details><summary>{t('pendingFiles')} ({pendingFiles.length})</summary><ul className="accounting-pending-files">{pendingFiles.map((file) => <li key={file.id}><a href={file.url}>{file.original_filename}</a><button className="admin-button" type="button" disabled={busy || (editing ? drafts[0].attachment_ids.length >= 10 : drafts.length >= 30)} onClick={() => addFile(file)}>{t('useFile')}</button></li>)}</ul></details>}
        {drafts.length > 0 && <form onSubmit={saveExpenses} onInvalid={() => setExpenseValidationError(true)} onChange={() => setExpenseValidationError(false)}><fieldset disabled={busy}><legend>{editing ? t('edit') : t('shared')}</legend>
          {editPaid && <p className="accounting-notice">{t('paidEdit')}</p>}
          <label>{t('supplier')}<input required maxLength={160} value={supplier} disabled={Boolean(editPaid)} onChange={(e) => { setSupplier(e.target.value); setDrafts(drafts.map((entry) => ({ ...entry, reviewed: false }))); }} /></label>
          {drafts.length > 1 && <div className="accounting-batch-defaults"><div className="accounting-fields"><label>{t('category')}<Select value={shared.category} onChange={(e) => setShared({ ...shared, category: e.target.value })}>{accountingCategories.filter((entry) => entry.kind === 'expense').map((category) => <option key={category.id} value={category.id}>{t(`categories.${category.id}`)}</option>)}</Select></label><label>{t('currency')}<Select value={shared.currency} onChange={(e) => setShared({ ...shared, currency: e.target.value, exchange_rate: e.target.value === 'NOK' ? '1' : '' })}>{accountingCurrencies.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label><label>{t('rate')}<input inputMode="decimal" value={shared.exchange_rate} disabled={shared.currency === 'NOK'} onChange={(e) => setShared({ ...shared, exchange_rate: e.target.value })} /></label></div><button className="admin-button" type="button" onClick={() => setDrafts(drafts.map((entry) => ({ ...entry, ...shared, reviewed: false })))}>{t('applyShared')}</button><p>{t('sharedHelp')}</p></div>}
          {drafts.map((entry, index) => <fieldset className={`accounting-draft${!validDraftAmount(entry) || !validDraftRate(entry) ? ' has-error' : ''}`} key={entry.id}><legend>{t('draft', { number: index + 1 })}</legend>
            <ul className="accounting-file-links">{entry.attachment_ids.map((id) => { const file = files.find((item) => item.id === id); return file && <li key={id}><a href={file.url}>{file.original_filename}</a></li>; })}</ul>
            {entry.warning && <p className="accounting-notice">{t(entry.warning)}</p>}
            {!validDraftAmount(entry) && <p className="accounting-draft-error" id={`accounting-amount-error-${entry.id}`}>{t('amountMissing')}</p>}
            {!validDraftRate(entry) && <p className="accounting-draft-error" id={`accounting-rate-error-${entry.id}`}>{t('rateMissing')}</p>}
            {entry.suggestedSupplier && entry.suggestedSupplier !== supplier && <p>{t('supplier')}: {entry.suggestedSupplier}</p>}
            <div className="accounting-fields">
              <label>{t('invoiceDate')}<input type="date" required min={`${data.year}-01-01`} max={`${data.year}-12-31`} value={entry.invoice_date} disabled={Boolean(editPaid)} onChange={(e) => updateDraft(entry.id, { invoice_date: e.target.value })} /></label>
              <label>{t('invoice')}<input maxLength={100} value={entry.invoice_number} disabled={Boolean(editPaid)} onChange={(e) => updateDraft(entry.id, { invoice_number: e.target.value })} /></label>
              <label>{t('description')}<input required maxLength={500} value={entry.description} onChange={(e) => updateDraft(entry.id, { description: e.target.value })} /></label>
              <label><span id={`accounting-claimant-label-${entry.id}`}>{t('claimant')}</span><input maxLength={320} value={entry.claimant_name} aria-labelledby={`accounting-claimant-label-${entry.id}`} aria-describedby={`accounting-claimant-help-${entry.id}`} onChange={(e) => updateDraft(entry.id, { claimant_name: e.target.value })} /><span id={`accounting-claimant-help-${entry.id}`} className="admin-field-note">{t('claimantHelp')}</span></label>
              <label>{t('category')}<Select value={entry.category} disabled={Boolean(editPaid)} onChange={(e) => updateDraft(entry.id, { category: e.target.value })}>{accountingCategories.filter((category) => category.kind === 'expense').map((category) => <option key={category.id} value={category.id}>{t(`categories.${category.id}`)}</option>)}</Select></label>
              <label>{t('amount')}<input inputMode="decimal" required value={entry.amount} disabled={Boolean(editPaid)} aria-invalid={!validDraftAmount(entry) || undefined} aria-describedby={!validDraftAmount(entry) ? `accounting-amount-error-${entry.id}` : undefined} onChange={(e) => updateDraft(entry.id, { amount: e.target.value })} /></label>
              <label>{t('currency')}<Select required value={entry.currency} disabled={Boolean(editPaid)} onChange={(e) => updateDraft(entry.id, { currency: e.target.value, exchange_rate: e.target.value === 'NOK' ? '1' : '' })}><option value="">{t('notEntered')}</option>{accountingCurrencies.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label>
              <label>{t('rate')}<input inputMode="decimal" required value={entry.exchange_rate} disabled={Boolean(editPaid) || entry.currency === 'NOK'} aria-invalid={!validDraftRate(entry) || undefined} aria-describedby={!validDraftRate(entry) ? `accounting-rate-error-${entry.id}` : undefined} onChange={(e) => updateDraft(entry.id, { exchange_rate: e.target.value })} /></label>
              <label>{t('submittedDate')}<input type="date" value={entry.submitted_on} onChange={(e) => updateDraft(entry.id, { submitted_on: e.target.value })} /></label>
              <label>{t('paidDate')}<input type="date" value={entry.paid_on} onChange={(e) => updateDraft(entry.id, { paid_on: e.target.value })} /></label>
            </div><p>{t('dateHelp')}</p><p className="accounting-emphasis">{t('nok')}: {draftAmount(entry) === null ? '–' : money(draftAmount(entry))}</p>
            {!entry.attachment_ids.length && <label>{t('receiptNote')}<input required maxLength={500} value={entry.receipt_note} onChange={(e) => updateDraft(entry.id, { receipt_note: e.target.value })} /></label>}
            <label>{t('notes')}<textarea maxLength={2000} rows={2} value={entry.notes} onChange={(e) => updateDraft(entry.id, { notes: e.target.value })} /></label>
            <label className="accounting-check"><input type="checkbox" required checked={entry.reviewed} onChange={(e) => updateDraft(entry.id, { reviewed: e.target.checked })} />{t('reviewed')}</label>
            {!editing && <button className="admin-button" type="button" onClick={() => setDrafts(drafts.filter((item) => item.id !== entry.id))}>{t('removeDraft')}</button>}
          </fieldset>)}
          {expenseValidationError && <p className="form-error" role="alert">{t('errors.invalidInput')} {drafts.some((entry) => !entry.reviewed) && t('errors.reviewRequired')}</p>}
          <p className="accounting-emphasis">{t('batchTotal', { amount: money(total) })}</p><div className="accounting-actions"><button className="primary-button" type="submit">{busy ? t('saving') : editing ? t('saveExpense') : t('saveBatch', { count: drafts.length })}</button>{editing && <button className="admin-button" type="button" onClick={() => { setEditing(null); setDrafts([]); }}>{t('cancelEdit')}</button>}</div>
        </fieldset></form>}
      </section>}
      <section className="accounting-panel"><div className="accounting-toolbar"><h2>{t('receipts')}</h2><button className="admin-button" type="button" disabled={busy || !exportEntries.length} onClick={downloadExpenses}>{t('downloadForAccountant', { count: exportEntries.length })}</button></div>
        <div className="accounting-fields"><label>{t('search')}<input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setSelected([]); }} /></label><label>{t('status')}<Select value={status} onChange={(e) => { setStatus(e.target.value); setSelected([]); }}>{['all', 'unsubmitted', 'pending', 'paid'].map((key) => <option value={key} key={key}>{t(key)}</option>)}</Select></label></div>
        <p>{t(selection.length ? 'exportSelectedHelp' : 'exportFilteredHelp', { count: exportEntries.length })}</p>
        {canWrite && selected.length > 0 && <div className="accounting-bulk"><strong>{t('selected', { count: selected.length })}</strong><label>{t('statusDate')}<input type="date" value={statusDate} onChange={(e) => setStatusDate(e.target.value)} /></label><button className="admin-button" type="button" disabled={busy || selection.some((entry) => entry.paid_on)} onClick={() => saveStatus('submit')}>{t('markSubmitted')}</button><button className="admin-button" type="button" disabled={busy || selection.some((entry) => entry.paid_on)} onClick={() => saveStatus('pay')}>{t('markPaid')}</button><p>{t('selectionHelp')}</p></div>}
        {filtered.length ? <div className="accounting-table-scroll" role="region" aria-label={t('receipts')} tabIndex={0}><table className="admin-table accounting-expenses"><caption>{t('receipts')} {data.year}</caption><thead><tr>{canWrite && <th scope="col"><input type="checkbox" aria-label={t('selectAll')} checked={filtered.every((entry) => selected.includes(entry.id))} onChange={(e) => setSelected(e.target.checked ? filtered.slice(0, 100).map((entry) => entry.id) : [])} /></th>}<th scope="col">{t('invoiceDate')}</th><th scope="col">{t('supplier')}</th><th scope="col">{t('category')}</th><th scope="col">{t('nok')}</th><th scope="col">{t('status')}</th><th scope="col">{t('files')}</th>{canWrite && <th scope="col">{t('edit')}</th>}</tr></thead><tbody>{filtered.map((expense) => <tr key={expense.id}>
          {canWrite && <td><input type="checkbox" aria-label={t('select', { description: `${expense.supplier} ${expense.invoice_number || expense.description}` })} checked={selected.includes(expense.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, expense.id] : selected.filter((id) => id !== expense.id))} /></td>}
          <td>{expense.invoice_date}</td><th scope="row">{expense.supplier}<span>{expense.description}</span><span>{expense.invoice_number}</span><span>{t('claimant')}: {expense.claimant_name || t('notEntered')}</span></th><td>{t(`categories.${expense.category}`)}</td><td className="accounting-money">{money(expense.amount_ore)}{expense.currency !== 'NOK' && <span>{decimalString(expense.amount_minor)} {expense.currency} × {decimalString(expense.exchange_rate_million, 6)}</span>}</td><td><span className={`accounting-status accounting-status-${expenseStatus(expense)}`}>{t(expenseStatus(expense))}</span>{expense.submitted_on && <span>{t('submitted')}: {expense.submitted_on}</span>}{expense.paid_on && <span>{t('paid')}: {expense.paid_on}</span>}</td><td>{files.filter((file) => file.expense_id === expense.id).map((file) => <a className="accounting-file" href={file.url} key={file.id}>{file.original_filename}</a>)}{!files.some((file) => file.expense_id === expense.id) && <span>{t('noFiles')} {expense.receipt_note}</span>}</td>{canWrite && <td><button type="button" className="admin-button" disabled={busy || drafts.length > 0} onClick={() => editExpense(expense)}>{t('edit')}</button></td>}
        </tr>)}</tbody></table></div> : <p>{t(data.expenses.length ? 'emptyFilter' : 'empty')}</p>}
      </section>
    </>}
  </div>;
}

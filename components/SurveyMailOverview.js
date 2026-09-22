'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Select from '@/components/Select';
import { useI18n } from '@/components/LocaleProvider';
import { mailRows, selectMailRows } from '@/lib/survey-mail-view';

const BATCH_SIZE = 25;
const EMPTY_ENTRIES = [];
const COLUMNS = [['member', 'member'], ['address', 'address'], ['type', 'mailType'], ['recipient', 'mailRecipient'], ['status', 'status'], ['note', 'note']];

export default function SurveyMailOverview({ history, loading }) {
  const { t, locale } = useI18n('surveys.email');
  const [filters, setFilters] = useState({ tile: 'all', type: '', status: '', note: '', sort: null });
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinel = useRef(null);
  const entries = history?.entries || EMPTY_ENTRIES;
  const rows = useMemo(() => mailRows(entries, t), [entries, t]);
  const matches = useMemo(() => selectMailRows(rows, filters, locale), [rows, filters, locale]);
  const hasMore = visibleCount < matches.length;
  const types = [...new Set(entries.map((entry) => entry.kind))];
  const statuses = [...new Map(rows.map((entry) => [entry.status, entry.cells.status]))]
    .sort((a, b) => a[1].localeCompare(b[1], locale));
  const changeFilters = (patch) => { setFilters((current) => ({ ...current, ...patch })); setVisibleCount(BATCH_SIZE); };

  useEffect(() => {
    const element = sentinel.current;
    if (!hasMore || loading || !element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        setVisibleCount((count) => count + BATCH_SIZE);
      }
    }, { rootMargin: '150px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, loading, visibleCount, matches]);

  if (!history) return <p role="status">{t('mailOverviewUnavailable')}</p>;
  const tiles = [
    ['invitations', 'sent_invitations', 'sentInvitations', 'sentInvitationsHelp'],
    ['properties', 'sent_properties', 'uniquePropertiesSent', 'uniquePropertiesHelp'],
    ['failed', 'failed', 'failed', 'failedMailHelp'],
    ['suppressed', 'suppressed', 'notSent', 'notSentHelp'],
  ];
  return <section className="survey-email-deliveries" aria-labelledby="mail-overview-title" aria-busy={loading}>
    <h4 id="mail-overview-title">{t('mailOverview')}</h4>
    <div className="survey-email-stats" role="group" aria-label={t('mailFilters')}>
      {tiles.map(([filter, count, label, help]) => <button key={filter} type="button"
        className="survey-email-stat-button" aria-pressed={filters.tile === filter}
        aria-controls="survey-mail-history" disabled={loading}
        onClick={() => changeFilters({ tile: filters.tile === filter ? 'all' : filter, type: '', status: '', note: '' })}>
        <span>{t(label)}</span><strong>{history.counts?.[count] ?? '—'}</strong>
        <small>{t(help)}</small>
      </button>)}
    </div>
    <div className="survey-mail-filters">
      {types.length > 1 && <label>{t('mailType')}<Select value={filters.type} onChange={(event) => changeFilters({ type: event.target.value })}>
        <option value="">{t('allMailTypes')}</option>{types.map((kind) => <option key={kind} value={kind}>{t(`mailKinds.${kind}`, {}, kind)}</option>)}
      </Select></label>}
      <label>{t('status')}<Select value={filters.status} onChange={(event) => changeFilters({ status: event.target.value })}>
        <option value="">{t('allMailStatuses')}</option>{statuses.map(([status, label]) => <option key={status} value={status}>{label}</option>)}
      </Select></label>
      <label>{t('note')}<input type="search" value={filters.note} placeholder={t('searchMailNotes')}
        onChange={(event) => changeFilters({ note: event.target.value })} /></label>
      <button type="button" className="admin-button" onClick={() => changeFilters({ tile: 'all', type: '', status: '', note: '', sort: null })}>{t('showAllMail')}</button>
    </div>
    <p role="status">{t('mailVisibleCount', { visible: Math.min(visibleCount, matches.length), count: matches.length })}</p>
    <div id="survey-mail-history" className="admin-table-scroll">
      <table className="admin-table">
        <caption>{t(`mailFilterCaptions.${filters.tile}`)}</caption>
        <thead><tr>{COLUMNS.map(([key, label]) => <th scope="col" key={key}
          aria-sort={filters.sort?.key === key ? (filters.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
          <button type="button" className="survey-mail-sort" onClick={() => changeFilters({ sort: {
            key, direction: filters.sort?.key === key && filters.sort.direction === 'asc' ? 'desc' : 'asc',
          } })}>{t(label)} <span aria-hidden="true">{filters.sort?.key === key ? (filters.sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></button>
        </th>)}</tr></thead>
        <tbody>{matches.slice(0, visibleCount).map((entry) => <tr key={entry.id}>
          <th scope="row">{entry.cells.member}</th>
          <td>{entry.cells.address}</td><td>{entry.cells.type}</td><td>{entry.cells.recipient}</td>
          <td>{entry.cells.status}</td><td className="survey-mail-note">{entry.cells.note}
            {entry.diagnostic?.error_id && <> <Link href={`/admin/audit?table=email_events&q=${encodeURIComponent(entry.diagnostic.error_id)}`}>{t('openErrorLog')}</Link></>}
          </td>
        </tr>)}</tbody>
      </table>
      {!matches.length && <p>{t('noMailMatches')}</p>}
    </div>
    {hasMore && <div ref={sentinel} className="survey-mail-more">
      <button type="button" className="admin-button" disabled={loading} onClick={() => setVisibleCount((count) => count + BATCH_SIZE)}>{t('loadMoreMail')}</button>
    </div>}
  </section>;
}

'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';

export default function SurveyRecipientPicker({ surveyId, selected, onChange, disabled }) {
  const { t } = useI18n('surveys.email');
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!query.trim()) { setMembers([]); return; }
      try {
        const response = await fetch(`/api/admin/surveys/${surveyId}/email?${new URLSearchParams({ search: query })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (controller.signal.aborted) return;
        setMembers(body.members); setError('');
      } catch { if (!controller.signal.aborted) setError(t('propertySearchError')); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, surveyId, t]);
  function toggle(member) {
    onChange(selected.some((item) => item.id === member.id) ? selected.filter((item) => item.id !== member.id) : [...selected, member]);
  }
  return <fieldset disabled={disabled} className="survey-recipient-picker"><legend>{t('individualProperties')}</legend>
    <label>{t('searchProperties')}<input type="search" value={query} maxLength={200} onChange={(event) => { setQuery(event.target.value); setMembers([]); setError(''); }} /></label>
    {selected.length > 0 && <ul>{selected.map((member) => <li key={member.id}>{member.h_number} · {member.street_address} <button className="admin-button" type="button" onClick={() => toggle(member)} aria-label={t('removeProperty', { number: member.h_number })}>×</button></li>)}</ul>}
    {query && <div className="survey-recipient-search-results">{members.map((member) => <label className="admin-checkbox" key={member.id}><input type="checkbox" checked={selected.some((item) => item.id === member.id)} onChange={() => toggle(member)} />{member.h_number} · {member.street_address} · {member.primary_contact_name}</label>)}</div>}
    {error && <p className="form-error" role="status">{error}</p>}
  </fieldset>;
}

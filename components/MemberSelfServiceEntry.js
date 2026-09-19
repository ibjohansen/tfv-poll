'use client';

import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {useI18n} from '@/components/LocaleProvider';

const emptyMembership = {
    h_number: '', cadastral_number: '', section_number: '', street_address: '', primary_contact_name: '',
    primary_contact_email: '', other_contact_emails: '',
};

export default function MemberSelfServiceEntry() {
    const {t} = useI18n('members.entry');
    const searchParams = useSearchParams();
    const membershipStatus = String(searchParams.get('membership') || '');
    const [mode, setMode] = useState('access');
    const [identifier, setIdentifier] = useState('');
    const [membership, setMembership] = useState(emptyMembership);
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState(
        membershipStatus === 'verified' ? t('verified') : membershipStatus === 'invalid' ? t('invalid') : '',
    );
    const [isError, setIsError] = useState(membershipStatus === 'invalid');

    async function submitAccess(event) {
        event.preventDefault();
        setBusy('access');
        setMessage('');
        setIsError(false);
        try {
            const response = await fetch('/api/member-access/request', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({identifier}),
            });
            const body = await response.json();
            if (!response.ok || !body.ok) throw new Error(body.message || t('requestError'));
            setMessage(body.message);
            setIdentifier('');
        } catch (error) {
            setMessage(error.message);
            setIsError(true);
        } finally {
            setBusy('');
        }
    }

    async function submitMembership(event) {
        event.preventDefault();
        setBusy('membership');
        setMessage('');
        setIsError(false);
        try {
            const response = await fetch('/api/membership-requests', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                signal: AbortSignal.timeout(25_000),
                body: JSON.stringify({
                    ...membership,
                    other_contact_emails: membership.other_contact_emails.split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean)
                }),
            });
            const body = await response.json();
            if (!response.ok || !body.ok) throw new Error(body.message || t('requestError'));
            setMessage(body.message);
            setMembership(emptyMembership);
        } catch (error) {
            setMessage(error.name === 'TimeoutError' || error.name === 'AbortError'
                ? t('timeout') : error.message || t('serverError'));
            setIsError(true);
        } finally {
            setBusy('');
        }
    }

    return <section id="medlemsopplysninger" className="member-self-service-entry"
                    aria-labelledby="member-self-service-title">
        <div className="member-self-service-intro">
            <p className="eyebrow">{t('eyebrow')}</p>
            <h2 id="member-self-service-title">{t('title')}</h2>
            <p>{t('introduction')}</p>
        </div>
        <div className="member-self-service-box">
            <div className="member-self-service-tabs" role="tablist" aria-label={t('tabs')}>
                <button type="button" role="tab" aria-selected={mode === 'access'} onClick={() => {
                    setMode('access');
                    setMessage('');
                }}>{t('registered')}
                </button>
                <button type="button" role="tab" aria-selected={mode === 'membership'} onClick={() => {
                    setMode('membership');
                    setMessage('');
                }}>{t('registerProperty')}
                </button>
            </div>
            {mode === 'access' ? <form className="member-self-service-form" onSubmit={submitAccess}>
                <label htmlFor="member-identifier">{t('identifier')}
                    <input id="member-identifier" value={identifier} onChange={(event) => {
                        setIdentifier(event.target.value);
                        setMessage('');
                    }} maxLength={320} required/>
                </label>
                <p>{t('privacy')}</p>
                <p>{t('linkWarning')}</p>
                <button className="primary-button" type="submit"
                        disabled={Boolean(busy)}>{busy === 'access' ? t('sending') : t('sendLink')}</button>
                {message && <p className={isError ? 'form-error' : 'admin-success'} role="status">{message}</p>}
            </form> : <form className="member-self-service-form membership-request-form" onSubmit={submitMembership}>
                <p>{t('newHelp')}</p>
                <div className="member-form-grid">
                    <label>{t('hNumber')}<input value={membership.h_number} onChange={(event) => setMembership({
                        ...membership,
                        h_number: event.target.value
                    })} maxLength={100}/></label>
                    <label>{t('streetAddress')}<input value={membership.street_address} onChange={(event) => setMembership({
                        ...membership,
                        street_address: event.target.value
                    })} maxLength={500}/></label>
                    <label>{t('cadastral')}<input value={membership.cadastral_number}
                                                       onChange={(event) => setMembership({
                                                           ...membership,
                                                           cadastral_number: event.target.value
                                                       })} maxLength={50} inputMode="numeric"
                                                       placeholder="10/770"/></label>
                    <label>{t('section')}<input value={membership.section_number}
                                                            onChange={(event) => setMembership({
                                                                ...membership,
                                                                section_number: event.target.value
                                                            })} maxLength={20} inputMode="numeric"
                                                            placeholder={t('sectionExample')}/></label>
                </div>
                <span className="member-form-note">{t('propertyHelp')}</span>
                <label>{t('contact')}<input value={membership.primary_contact_name} onChange={(event) => setMembership({
                    ...membership,
                    primary_contact_name: event.target.value
                })} maxLength={500} autoComplete="name" required/></label>
                <label>{t('primaryEmail')}<input type="email" value={membership.primary_contact_email}
                                          onChange={(event) => setMembership({
                                              ...membership,
                                              primary_contact_email: event.target.value
                                          })} maxLength={254} autoComplete="email" required/></label>
                <label>{t('otherEmails')}<textarea value={membership.other_contact_emails}
                                                     onChange={(event) => setMembership({
                                                         ...membership,
                                                         other_contact_emails: event.target.value
                                                     })} rows={3} placeholder={t('emailsPlaceholder')}/></label>
                <button className="primary-button" type="submit"
                        disabled={Boolean(busy) || (!membership.h_number.trim() && !membership.street_address.trim())}>{busy === 'membership' ? t('sending') : t('submitMembership')}</button>
            </form>}
            {mode === 'membership' && message &&
                <p className={isError ? 'form-error' : 'admin-success'} role="status">{message}</p>}
        </div>
    </section>;
}

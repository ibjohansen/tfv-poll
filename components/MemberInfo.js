'use client';

import MemberPropertyMap from '@/components/MemberPropertyMap';
import { useI18n } from '@/components/LocaleProvider';

export default function MemberInfo({ access }) {
  const { t } = useI18n();
  const member = access.member;
  const fields = member ? [
    [t('members.common.hNumber'), member.h_number],
    [t('members.common.cadastralNumber'), member.cadastral_number],
    [t('members.common.sectionNumber'), member.section_number],
    [t('members.info.streetAddress'), member.street_address],
  ] : [];

  return (
    <section className={`member-section${access.status !== "ready" ? " member-section-error" : ""}`} aria-labelledby="member-heading">
      <p className="eyebrow">{t('members.info.eyebrow')}</p>
      <h2 id="member-heading">{t('members.info.title')}</h2>
      <p className="member-message" role="status">{access.message}</p>
      {member && (
        <dl className="member-details">
          {fields.map(([label, value]) => (
            <div className={label === t('members.info.streetAddress') ? "member-address-detail" : undefined} key={label}>
              <dt>{label}</dt>
              <dd>{label === "Hjemmelshaver" && value
                ? value.split(" / ").map((name, index) => <span className="owner-line" key={index}>{name}</span>)
                : value || t('general.states.notRegistered')}</dd>
              {label === t('members.info.streetAddress') && value && <MemberPropertyMap streetAddress={value} />}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

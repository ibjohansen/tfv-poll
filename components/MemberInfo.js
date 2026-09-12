import MemberPropertyMap from '@/components/MemberPropertyMap';

export default function MemberInfo({ access }) {
  const member = access.member;
  const fields = member ? [
    ["H-nummer", member.h_number],
    ["Gårds- og bruksnummer", member.cadastral_number],
    ["Seksjonsnummer", member.section_number],
    ["Gateadresse og nummer", member.street_address],
  ] : [];

  return (
    <section className={`member-section${access.status !== "ready" ? " member-section-error" : ""}`} aria-labelledby="member-heading">
      <p className="eyebrow">Medlemsregister</p>
      <h2 id="member-heading">Din tomt og besvarelse</h2>
      <p className="member-message" role="status">{access.message}</p>
      {member && (
        <dl className="member-details">
          {fields.map(([label, value]) => (
            <div className={label === "Gateadresse og nummer" ? "member-address-detail" : undefined} key={label}>
              <dt>{label}</dt>
              <dd>{label === "Hjemmelshaver" && value
                ? value.split(" / ").map((name, index) => <span className="owner-line" key={index}>{name}</span>)
                : value || "Ikke registrert"}</dd>
              {label === "Gateadresse og nummer" && value && <MemberPropertyMap streetAddress={value} />}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

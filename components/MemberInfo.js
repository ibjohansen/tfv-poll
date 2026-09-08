export default function MemberInfo({ access }) {
  const member = access.member;
  const fields = member ? [
    ["H-nummer", member.h_number],
    ["Gårds- og bruksnummer", member.cadastral_number],
    ["Gateadresse og nummer", member.street_address],
    ["Hjemmelshaver", member.title_holder],
    ["Tinglysningsdato", member.registration_date],
    ["Hovedkontakt navn", member.primary_contact_name],
    ["Hovedkontakt e-post", member.primary_contact_email],
  ] : [];

  return (
    <section className={`member-section${access.status !== "ready" ? " member-section-error" : ""}`} aria-labelledby="member-heading">
      <p className="eyebrow">Medlemsregister</p>
      <h2 id="member-heading">Din tomt og besvarelse</h2>
      <p className="member-message" role="status">{access.message}</p>
      {member && (
        <dl className="member-details">
          {fields.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{label === "Hjemmelshaver" && value
              ? value.split(" / ").map((name, index) => <span className="owner-line" key={index}>{name}</span>)
              : value || "Ikke registrert"}</dd></div>
          ))}
          <div>
            <dt>Andre kontakt-e-postadresser</dt>
            <dd>{member.other_contact_emails?.length ? (
              <ul>{member.other_contact_emails.map((email, index) => <li key={index}>{email}</li>)}</ul>
            ) : "Ingen registrert"}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

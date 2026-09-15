export function memberContactEmails(member) {
  return [...new Set([member.primary_contact_email, ...(member.other_contact_emails || [])]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))];
}

// Association only: no merging of owners, contacts, tokens or property rows.
export function attachSharedContactGroups(members, relatedMembers = members) {
  const groups = new Map();
  for (const member of relatedMembers) {
    for (const email of memberContactEmails(member)) {
      if (!groups.has(email)) groups.set(email, new Map());
      groups.get(email).set(String(member.id), {
        id: String(member.id), h_number: member.h_number, street_address: member.street_address,
        contact_name: member.primary_contact_name,
      });
    }
  }
  return members.map((member) => ({ ...member, shared_email_groups: memberContactEmails(member)
    .filter((email) => groups.get(email)?.size > 1)
    .map((email) => ({ email, properties: [...groups.get(email).values()] })) }));
}

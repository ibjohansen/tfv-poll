// Shared ordering keeps the map and member register aligned without coupling
// either surface to the other's state or mutation logic.
export const MEMBER_PROPERTY_FIELDS = Object.freeze([
  ['h_number', true], ['cadastral_number', true], ['section_number', true],
]);
export const MEMBER_OWNERSHIP_FIELDS = Object.freeze([
  ['title_holder', true, true], ['registration_date', true, true],
]);
export const MEMBER_CONTACT_FIELDS = Object.freeze([
  ['primary_contact_name'], ['primary_contact_email'], ['other_contact_emails'], ['admin_comment'],
]);

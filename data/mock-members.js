// Kun fiktive testdata. Ingen kobling til det faktiske medlemsregisteret.
export const mockMembers = [
  {
    id: '1', access_token: '11111111111111111111111111111111',
    h_number: 'H-TEST-001', cadastral_number: '900/1',
    street_address: 'Testveien 1', title_holder: 'Testperson Én',
    registration_date: '15.01.2026', primary_contact_name: 'Testkontakt Én',
    primary_contact_email: 'kontakt1@example.com',
    other_contact_emails: ['ekstra1@example.com', 'ekstra2@example.com'],
    has_responded: false,
  },
  {
    id: '2', access_token: '22222222222222222222222222222222',
    h_number: 'H-TEST-002', cadastral_number: '900/2',
    street_address: 'Testveien 2', title_holder: 'Testperson To',
    registration_date: '20.02.2026', primary_contact_name: 'Testkontakt To',
    primary_contact_email: 'kontakt2@example.com', other_contact_emails: [],
    has_responded: true,
  },
  {
    id: '3', access_token: '33333333333333333333333333333333',
    h_number: 'H-TEST-003', cadastral_number: null,
    street_address: null, title_holder: null, registration_date: null,
    primary_contact_name: null, primary_contact_email: null,
    other_contact_emails: [], has_responded: false,
  },
];

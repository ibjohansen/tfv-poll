// Transcribed from Protokoll-2026.pdf, pp. 3–5. Amounts are integer NOK øre.
// The detailed financial report is for 2025, despite the 2024 heading on p. 1.
export const accountingCategories = [
  { id: 'dues', code: '3920', kind: 'income' },
  { id: 'fees', code: '3950', kind: 'income' },
  { id: 'reminders', code: '8056', kind: 'income' },
  { id: 'board', code: '5330', kind: 'expense' },
  { id: 'systems', code: '6420', kind: 'expense' },
  { id: 'accountant', code: '6700', kind: 'expense' },
  { id: 'trailer', code: '', kind: 'expense' },
  { id: 'other', code: '6890', kind: 'expense' },
  { id: 'bank', code: '7700', kind: 'expense' },
];

export const accountingDefaults = {
  annualFee: '250.00', meetingMonth: 4,
  budget2026: { dues: 10275000, fees: 0, reminders: 0, board: 5300000, systems: 500000,
    accountant: 500000, trailer: 800000, other: 2000000, bank: 200000 },
  members2026: 411,
};

export const accountingReference2025 = {
  year: 2025,
  actual: { dues: 10607000, fees: 5000, reminders: 205000, board: 4774306, systems: 687100,
    accountant: 600000, trailer: 0, other: 547675, bank: 129650 },
  // Equipment (6454), gifts (7430) and bad debts (7830) are grouped under Other.
  // The source uses 7770 for bank fees; the approved 2026 budget uses 7700.
  otherAccounts: [{ code: '6454', amount: 199775 }, { code: '7430', amount: 122900 }, { code: '7830', amount: 225000 }],
  balance: { receivables: 933000, bank: 4030685, equity: 4784428, suppliers: 165100, otherDebt: 14157 },
};

export const accountingCurrencies = ['NOK', 'USD', 'EUR', 'GBP', 'SEK', 'DKK', 'CHF', 'CAD', 'AUD', 'PLN'];

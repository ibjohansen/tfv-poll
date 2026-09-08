const osloDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Oslo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function isValidSurveyEndDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeSurveyEndDate(value) {
  if (isValidSurveyEndDate(value)) return value;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  const dateKey = value.toISOString().slice(0, 10);
  return isValidSurveyEndDate(dateKey) ? dateKey : '';
}

export function osloDateKey(now = new Date()) {
  const parts = Object.fromEntries(osloDateFormatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function surveyHasEnded(endsOn, now = new Date()) {
  const dateKey = normalizeSurveyEndDate(endsOn);
  return Boolean(dateKey) && dateKey < osloDateKey(now);
}

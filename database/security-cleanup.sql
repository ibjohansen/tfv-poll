-- Kjør bare etter at versjonen med survey_access_tokens og survey_sessions er
-- publisert og verifisert. Dette gjør alle gamle globale surveylenker permanent
-- ugyldige. Skriptet er idempotent.
DO $cleanup$
BEGIN
  IF to_regclass('public.survey_access_tokens') IS NULL
    OR to_regclass('public.survey_sessions') IS NULL THEN
    RAISE EXCEPTION 'Nytt survey-skjema mangler; cleanup avbrytes';
  END IF;
END;
$cleanup$;

ALTER TABLE members DROP COLUMN IF EXISTS access_token;
ALTER TABLE members DROP COLUMN IF EXISTS access_expires_at;
ALTER TABLE members DROP COLUMN IF EXISTS access_revoked_at;

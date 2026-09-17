CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  q1 TEXT CHECK (q1 IN ('ja', 'nei', 'usikker')),
  q2 TEXT CHECK (q2 IN ('ja', 'nei', 'usikker')),
  q3 TEXT CHECK (q3 IN ('ja', 'nei', 'usikker')),
  q4 TEXT CHECK (q4 IN ('ja', 'nei', 'usikker')),
  answers JSONB,
  question_version INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS survey_responses_created_at_idx
  ON survey_responses (created_at DESC);

CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  h_number TEXT NOT NULL,
  cadastral_number TEXT,
  section_number TEXT,
  street_address TEXT,
  title_holder TEXT,
  registration_date TEXT,
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  other_contact_emails TEXT[] NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  ends_on DATE NOT NULL,
  question_version INTEGER NOT NULL DEFAULT 1,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Beholder eventuelle gamle, anonyme svar uten å tilordne dem til medlemmer.
ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS member_id BIGINT REFERENCES members(id),
  ADD COLUMN IF NOT EXISTS survey_id TEXT REFERENCES surveys(id);

-- Bevarer gamle svar, men nye svar er koblet til den konfigurerte spørsmålversjonen.
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS answers JSONB;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS question_version INTEGER;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS questions JSONB;
UPDATE survey_responses
SET answers = jsonb_build_object('q1', q1, 'q2', q2, 'q3', q3, 'q4', q4), question_version = 0
WHERE answers IS NULL;
ALTER TABLE survey_responses ALTER COLUMN q1 DROP NOT NULL;
ALTER TABLE survey_responses ALTER COLUMN q2 DROP NOT NULL;
ALTER TABLE survey_responses ALTER COLUMN q3 DROP NOT NULL;
ALTER TABLE survey_responses ALTER COLUMN q4 DROP NOT NULL;
ALTER TABLE survey_responses DROP CONSTRAINT IF EXISTS survey_responses_member_survey_pair_check;
ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_member_survey_pair_check
  CHECK ((member_id IS NULL AND survey_id IS NULL) OR (member_id IS NOT NULL AND survey_id IS NOT NULL));
ALTER TABLE survey_responses DROP CONSTRAINT IF EXISTS survey_responses_member_answers_check;
ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_member_answers_check
  CHECK (member_id IS NULL OR (answers IS NOT NULL AND question_version IS NOT NULL));

-- Existing answers stay property-scoped. New independent answers use an email key.
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS single_response_per_property BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS response_key TEXT NOT NULL DEFAULT 'property';
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS respondent_email TEXT;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS submission_session_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_scope_idx
  ON survey_responses (member_id, survey_id, response_key);
DROP INDEX IF EXISTS survey_responses_member_survey_idx;

-- Adminfelt og stabil importidentitet. Flere medlemmer kan vente på H-nummer.
ALTER TABLE members ADD COLUMN IF NOT EXISTS admin_comment TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS membership_status TEXT NOT NULL DEFAULT 'member'
  CHECK (membership_status IN ('member', 'exempt'));
ALTER TABLE members ADD COLUMN IF NOT EXISTS section_number TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS import_key TEXT UNIQUE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
-- Reservasjonen gjelder bare manuell deling/utveksling av kontaktinformasjon
-- med Turufjell AS. Eksisterende poster beholdes som ikke reservert.
ALTER TABLE members ADD COLUMN IF NOT EXISTS turufjell_as_sharing_opt_out BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS turufjell_as_sharing_opt_out_updated_at TIMESTAMPTZ;
ALTER TABLE members ALTER COLUMN registration_date TYPE TEXT USING registration_date::text;
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_h_number_key;
DROP INDEX IF EXISTS members_known_h_number_idx;
CREATE UNIQUE INDEX IF NOT EXISTS members_known_h_number_idx
  ON members (h_number) WHERE h_number <> 'N/A' AND deleted_at IS NULL;

-- Kjøringer mot Kartverkets Matrikkel-API. Hver kjøring tar et komplett
-- øyeblikksbilde av feltene den har lov til å endre før første oppslag.
CREATE TABLE IF NOT EXISTS matrikkel_sync_runs (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  requested_by TEXT NOT NULL,
  h_number_filter TEXT,
  total_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  worker_token TEXT,
  worker_lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS matrikkel_sync_backups (
  run_id TEXT NOT NULL REFERENCES matrikkel_sync_runs(id) ON DELETE RESTRICT,
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  cadastral_number TEXT,
  section_number TEXT,
  title_holder TEXT,
  registration_date TEXT,
  PRIMARY KEY (run_id, member_id)
);

CREATE TABLE IF NOT EXISTS matrikkel_sync_items (
  run_id TEXT NOT NULL REFERENCES matrikkel_sync_runs(id) ON DELETE RESTRICT,
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'updated', 'unchanged', 'review', 'skipped', 'error')),
  source_address TEXT,
  official_address TEXT,
  match_type TEXT,
  previous_values JSONB,
  proposed_values JSONB,
  details JSONB,
  message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (run_id, member_id)
);

CREATE INDEX IF NOT EXISTS matrikkel_sync_runs_created_at_idx
  ON matrikkel_sync_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS matrikkel_sync_items_status_idx
  ON matrikkel_sync_items (run_id, status);
ALTER TABLE matrikkel_sync_runs ADD COLUMN IF NOT EXISTS h_number_filter TEXT;
ALTER TABLE matrikkel_sync_backups ADD COLUMN IF NOT EXISTS section_number TEXT;
ALTER TABLE matrikkel_sync_runs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
-- Eldre installasjoner fikk ikke kolonnene fra CREATE TABLE IF NOT EXISTS.
ALTER TABLE matrikkel_sync_runs ADD COLUMN IF NOT EXISTS worker_token TEXT;
ALTER TABLE matrikkel_sync_runs ADD COLUMN IF NOT EXISTS worker_lease_expires_at TIMESTAMPTZ;
ALTER TABLE matrikkel_sync_runs ADD COLUMN IF NOT EXISTS dispatch_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matrikkel_sync_runs ADD COLUMN IF NOT EXISTS last_dispatch_at TIMESTAMPTZ;
ALTER TABLE matrikkel_sync_items ADD COLUMN IF NOT EXISTS worker_token TEXT;
ALTER TABLE matrikkel_sync_items ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matrikkel_sync_runs DROP CONSTRAINT IF EXISTS matrikkel_sync_runs_status_check;
ALTER TABLE matrikkel_sync_runs ADD CONSTRAINT matrikkel_sync_runs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));

ALTER TABLE surveys ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS ends_on DATE;
UPDATE surveys SET ends_on = (CURRENT_DATE + INTERVAL '1 year')::date WHERE ends_on IS NULL;
ALTER TABLE surveys ALTER COLUMN ends_on SET NOT NULL;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS question_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Den opprinnelige undersøkelsen brukte en lesbar ID. Bytt den til den hemmelige
-- hex-ID-en, og la referanser fra eksisterende svar følge med.
ALTER TABLE survey_responses DROP CONSTRAINT IF EXISTS survey_responses_survey_id_fkey;
ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_survey_id_fkey
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON UPDATE CASCADE;
UPDATE surveys
SET id = '616fd7e9e244b6f4947eb1822dbd01ad'
WHERE id = 'kristnatten-2026'
  AND NOT EXISTS (SELECT 1 FROM surveys WHERE id = '616fd7e9e244b6f4947eb1822dbd01ad');

INSERT INTO surveys (id, title, ends_on)
VALUES ('616fd7e9e244b6f4947eb1822dbd01ad', 'Medlemsundersøkelse om Kristnatten', (CURRENT_DATE + INTERVAL '1 year')::date)
ON CONFLICT (id) DO NOTHING;

-- En tidligere versjon av oppsettet kunne opprette hex-ID-en før den lesbare
-- ID-en ble migrert. Slå i så fall sammen de to radene. Innholdet fra den
-- opprinnelige raden beholdes, svar flyttes når det ikke finnes en konflikt,
-- og den gamle raden soft-deletes slik at ingen data hard-slettes.
UPDATE surveys AS canonical
SET title = legacy.title,
    is_open = legacy.is_open,
    ends_on = legacy.ends_on,
    question_version = legacy.question_version,
    questions = legacy.questions,
    created_at = LEAST(canonical.created_at, legacy.created_at),
    updated_at = GREATEST(canonical.updated_at, legacy.updated_at)
FROM surveys AS legacy
WHERE canonical.id = '616fd7e9e244b6f4947eb1822dbd01ad'
  AND legacy.id = 'kristnatten-2026'
  AND legacy.deleted_at IS NULL;

UPDATE survey_responses AS legacy_response
SET survey_id = '616fd7e9e244b6f4947eb1822dbd01ad'
WHERE legacy_response.survey_id = 'kristnatten-2026'
  AND NOT EXISTS (
    SELECT 1
    FROM survey_responses AS canonical_response
    WHERE canonical_response.survey_id = '616fd7e9e244b6f4947eb1822dbd01ad'
      AND canonical_response.member_id = legacy_response.member_id
  );

UPDATE surveys
SET deleted_at = COALESCE(deleted_at, NOW()),
    is_open = FALSE,
    updated_at = NOW()
WHERE id = 'kristnatten-2026'
  AND deleted_at IS NULL;

UPDATE surveys SET questions = '[{"id":"q1","number":1,"text":"Var lovnad om alpinanlegg på Kristnatten avgjørende for kjøp av tomt/hytte på Turufjell?"},{"id":"q2","number":2,"text":"Mener du at du er blitt ført bak lyset/lurt i kjøpsprosessen, enten av markedsføring eller lovnader fra Turufjell eller representanter for Turufjell?"},{"id":"q3","number":3,"text":"Ønsker du at vel-foreningen skal forfølge et eventuelt løftebrudd på vegne av medlemmene?"},{"id":"q4","number":4,"text":"Ønsker du å bidra økonomisk til en slik prosess?"}]'::jsonb
WHERE id = '616fd7e9e244b6f4947eb1822dbd01ad' AND questions = '[]'::jsonb;

-- Bevarer spørsmålsteksten som gjaldt da svaret ble sendt inn. Dette gjør at
-- historiske resultater fortsatt kan tolkes etter at en undersøkelse redigeres.
UPDATE survey_responses AS response
SET questions = survey.questions
FROM surveys AS survey
WHERE response.survey_id = survey.id AND response.questions IS NULL;

-- Strukturert CMS-innhold. Redaktøren kan ikke lagre HTML eller egendefinert
-- presentasjon. Sider og filmetadata mykslettes på samme måte som øvrige data.
CREATE TABLE IF NOT EXISTS cms_pages (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) <= 100),
  intro TEXT CHECK (char_length(intro) <= 500),
  body TEXT CHECK (char_length(body) <= 100000),
  category TEXT NOT NULL,
  image_alt TEXT CHECK (char_length(image_alt) <= 300),
  image_caption TEXT CHECK (char_length(image_caption) <= 500),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS cms_pages_active_slug_idx
  ON cms_pages (slug) WHERE deleted_at IS NULL;
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS body_rich_text JSONB
  CHECK (body_rich_text IS NULL OR (jsonb_typeof(body_rich_text) = 'object' AND octet_length(body_rich_text::text) <= 1000000));
CREATE INDEX IF NOT EXISTS cms_pages_public_idx
  ON cms_pages (published_at DESC) WHERE status = 'published' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS cms_attachments (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  page_id TEXT NOT NULL REFERENCES cms_pages(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'attachment')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  original_filename TEXT NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (char_length(mime_type) <= 150),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS cms_attachments_active_image_idx
  ON cms_attachments (page_id) WHERE kind = 'image' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cms_attachments_page_order_idx
  ON cms_attachments (page_id, kind, sort_order, created_at) WHERE deleted_at IS NULL;

-- Vedlegg til en undersøkelse lagres privat i Object Storage. Databasen
-- inneholder bare metadata og den interne objekt-nøkkelen.
CREATE TABLE IF NOT EXISTS survey_attachments (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  original_filename TEXT NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (char_length(mime_type) <= 150),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  last_changed_by TEXT
);
CREATE INDEX IF NOT EXISTS survey_attachments_survey_order_idx
  ON survey_attachments (survey_id, sort_order, created_at) WHERE deleted_at IS NULL;

-- E-postkampanjer og leveringsstatus. E-postinnhold og personlige survey-lenker
-- lagres ikke. Medlemsregisteret er fortsatt autoritativ kilde for adresser.
CREATE TABLE IF NOT EXISTS email_campaigns (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL DEFAULT 'survey' CHECK (kind IN ('survey')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  requested_by TEXT NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  missing_email_count INTEGER NOT NULL DEFAULT 0 CHECK (missing_email_count >= 0),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  delivered_count INTEGER NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  suppressed_count INTEGER NOT NULL DEFAULT 0 CHECK (suppressed_count >= 0),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS email_campaigns_survey_once_idx
  ON email_campaigns (survey_id) WHERE kind = 'survey' AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS email_campaigns_created_at_idx
  ON email_campaigns (created_at DESC);
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS worker_token TEXT;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS worker_lease_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS email_deliveries (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  campaign_id TEXT REFERENCES email_campaigns(id) ON DELETE RESTRICT,
  member_id BIGINT REFERENCES members(id) ON DELETE RESTRICT,
  survey_id TEXT REFERENCES surveys(id) ON DELETE RESTRICT,
  recipient_email TEXT NOT NULL CHECK (char_length(recipient_email) <= 254),
  email_type TEXT NOT NULL CHECK (email_type IN ('survey_invitation', 'survey_test')),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 998),
  provider TEXT NOT NULL DEFAULT 'mailersend' CHECK (provider = 'mailersend'),
  provider_message_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'delivered', 'failed', 'bounced', 'suppressed')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);

ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS include_other_emails BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_campaign_recipient_idx
  ON email_deliveries (campaign_id, member_id, recipient_email) WHERE campaign_id IS NOT NULL;
DROP INDEX IF EXISTS email_deliveries_campaign_member_idx;
CREATE INDEX IF NOT EXISTS email_deliveries_campaign_status_idx
  ON email_deliveries (campaign_id, status, created_at);
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS requested_by TEXT;

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 160),
  body JSONB NOT NULL CHECK (jsonb_typeof(body) = 'object' AND octet_length(body::text) <= 1000000),
  group_ids BIGINT[] NOT NULL CHECK (cardinality(group_ids) BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'running', 'completed', 'failed')),
  requested_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  worker_token TEXT,
  worker_lease_expires_at TIMESTAMPTZ,
  error_message TEXT
);
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS newsletter_id TEXT REFERENCES newsletter_campaigns(id) ON DELETE RESTRICT;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS audience_member_ids BIGINT[];
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_newsletter_recipient_idx
  ON email_deliveries (newsletter_id, recipient_email) WHERE newsletter_id IS NOT NULL AND email_type = 'newsletter';
CREATE INDEX IF NOT EXISTS email_deliveries_newsletter_status_idx ON email_deliveries (newsletter_id, status, created_at);

CREATE TABLE IF NOT EXISTS email_webhook_events (
  provider_event_id TEXT PRIMARY KEY,
  provider_message_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_suppressions (
  recipient_email TEXT PRIMARY KEY CHECK (char_length(recipient_email) <= 254),
  reason TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mailersend' CHECK (provider = 'mailersend'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_hamlets (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  deleted_at TIMESTAMPTZ,
  last_changed_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS member_hamlets_name_idx ON member_hamlets (lower(btrim(name))) WHERE deleted_at IS NULL;
-- Grendegrenser er interne, manuelt kontrollerte områder, ikke matrikkelgrenser.
-- Ingen navn eller koordinater seeds fra et bilde uten geografisk forankring.
ALTER TABLE member_hamlets ADD COLUMN IF NOT EXISTS polygon JSONB
  CHECK (polygon IS NULL OR (
    jsonb_typeof(polygon) = 'object' AND polygon->>'type' = 'Polygon'
    AND jsonb_typeof(polygon->'coordinates') = 'array'
    AND jsonb_array_length(polygon->'coordinates') = 1
    AND octet_length(polygon::text) <= 30000
  ) IS TRUE);
ALTER TABLE member_hamlets ADD COLUMN IF NOT EXISTS polygon_reviewed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE member_hamlets ADD COLUMN IF NOT EXISTS polygon_version INTEGER NOT NULL DEFAULT 1 CHECK (polygon_version > 0);
ALTER TABLE member_hamlets ADD COLUMN IF NOT EXISTS polygon_updated_at TIMESTAMPTZ;
CREATE OR REPLACE FUNCTION version_hamlet_polygon()
RETURNS TRIGGER LANGUAGE plpgsql AS $hamlet_version$
BEGIN
  NEW.polygon_version := OLD.polygon_version + 1;
  NEW.polygon_updated_at := NOW();
  RETURN NEW;
END;
$hamlet_version$;
DROP TRIGGER IF EXISTS member_hamlets_version_trigger ON member_hamlets;
CREATE TRIGGER member_hamlets_version_trigger BEFORE UPDATE ON member_hamlets
FOR EACH ROW EXECUTE FUNCTION version_hamlet_polygon();
ALTER TABLE members ADD COLUMN IF NOT EXISTS hamlet_id BIGINT REFERENCES member_hamlets(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS members_hamlet_idx ON members (hamlet_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS member_email_groups (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  deleted_at TIMESTAMPTZ,
  last_changed_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS member_email_groups_name_idx ON member_email_groups (lower(btrim(name))) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS member_email_group_members (
  group_id BIGINT NOT NULL REFERENCES member_email_groups(id) ON DELETE RESTRICT,
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  PRIMARY KEY (group_id, member_id)
);
CREATE INDEX IF NOT EXISTS member_email_group_members_member_idx ON member_email_group_members (member_id);
-- Mottakergrunnlaget for en undersøkelsesutsendelse låses til én eksplisitt
-- e-postgruppe. Eldre kampanjer uten gruppe beholdes for historikk.
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES member_email_groups(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'email_deliveries' AND column_name = 'source_group_id') THEN
    ALTER TABLE email_deliveries ADD COLUMN source_group_id BIGINT;
    UPDATE email_deliveries d SET source_group_id = c.group_id FROM email_campaigns c WHERE c.id = d.campaign_id;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS email_campaigns_group_idx ON email_campaigns (group_id) WHERE group_id IS NOT NULL;

-- Tidsbegrenset e-postinnlogging for medlemmenes selvbetjening. Bare SHA-256-
-- hash av den tilfeldige lenkehemmeligheten lagres i databasen.
CREATE TABLE IF NOT EXISTS member_access_tokens (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  audience TEXT NOT NULL CHECK (char_length(audience) BETWEEN 3 AND 100),
  purpose TEXT NOT NULL DEFAULT 'member_login' CHECK (purpose = 'member_login'),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE member_access_tokens ADD COLUMN IF NOT EXISTS environment TEXT;
ALTER TABLE member_access_tokens ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE member_access_tokens ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT 'member_login';
ALTER TABLE member_access_tokens ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;
ALTER TABLE member_access_tokens ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE member_access_tokens ADD COLUMN IF NOT EXISTS member_ids BIGINT[];

CREATE INDEX IF NOT EXISTS member_access_tokens_member_idx
  ON member_access_tokens (member_id, expires_at DESC);
DROP INDEX IF EXISTS member_access_tokens_one_active_idx;
CREATE UNIQUE INDEX IF NOT EXISTS member_access_tokens_one_active_idx
  ON member_access_tokens (member_id)
  WHERE revoked_at IS NULL AND consumed_at IS NULL;

-- Den kortvarige e-postkoden byttes atomisk mot en separat, hash-lagret
-- medlemssesjon. Den opprinnelige URL-hemmeligheten brukes aldri som cookie.
CREATE TABLE IF NOT EXISTS member_sessions (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  session_token_hash TEXT NOT NULL UNIQUE CHECK (session_token_hash ~ '^[a-f0-9]{64}$'),
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  audience TEXT NOT NULL CHECK (char_length(audience) BETWEEN 3 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS member_sessions_member_idx
  ON member_sessions (member_id, expires_at DESC);
ALTER TABLE member_sessions ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE member_sessions ADD COLUMN IF NOT EXISTS member_ids BIGINT[];
CREATE INDEX IF NOT EXISTS member_sessions_expiry_idx
  ON member_sessions (expires_at) WHERE revoked_at IS NULL;

-- Endring av hoved-e-post krever først kontroll over gammel adresse og deretter
-- en separat engangsbekreftelse sendt til den nye adressen.
CREATE TABLE IF NOT EXISTS member_email_changes (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  old_email TEXT NOT NULL CHECK (char_length(old_email) <= 254),
  pending_email TEXT NOT NULL CHECK (char_length(pending_email) <= 254),
  old_token_hash TEXT UNIQUE CHECK (old_token_hash IS NULL OR old_token_hash ~ '^[a-f0-9]{64}$'),
  new_token_hash TEXT UNIQUE CHECK (new_token_hash IS NULL OR new_token_hash ~ '^[a-f0-9]{64}$'),
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  audience TEXT NOT NULL CHECK (char_length(audience) BETWEEN 3 AND 100),
  status TEXT NOT NULL DEFAULT 'pending_old'
    CHECK (status IN ('pending_old', 'pending_new', 'completed', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  old_confirmed_at TIMESTAMPTZ,
  new_confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS member_email_changes_one_pending_idx
  ON member_email_changes (member_id)
  WHERE status IN ('pending_old', 'pending_new');

-- Ett hashet engangstoken og én kortvarig sesjon per medlem/undersøkelse.
CREATE TABLE IF NOT EXISTS survey_access_tokens (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  audience TEXT NOT NULL CHECK (char_length(audience) BETWEEN 3 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS survey_access_tokens_member_survey_idx
  ON survey_access_tokens (member_id, survey_id, created_at DESC);
ALTER TABLE survey_access_tokens ADD COLUMN IF NOT EXISTS recipient_email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS survey_access_tokens_recipient_active_idx
  ON survey_access_tokens (member_id, survey_id, COALESCE(recipient_email, ''))
  WHERE consumed_at IS NULL AND answered_at IS NULL AND revoked_at IS NULL;
DROP INDEX IF EXISTS survey_access_tokens_one_active_idx;

CREATE TABLE IF NOT EXISTS survey_sessions (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  session_token_hash TEXT NOT NULL UNIQUE CHECK (session_token_hash ~ '^[a-f0-9]{64}$'),
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  audience TEXT NOT NULL CHECK (char_length(audience) BETWEEN 3 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS survey_sessions_member_survey_idx
  ON survey_sessions (member_id, survey_id, expires_at DESC);
ALTER TABLE survey_sessions ADD COLUMN IF NOT EXISTS recipient_email TEXT;

-- Transactional outbox: response and its primary-contact receipt are committed
-- together. A receipt also records a later attempt, without replacing the winner.
CREATE TABLE IF NOT EXISTS survey_response_receipts (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  response_id BIGINT NOT NULL REFERENCES survey_responses(id) ON DELETE RESTRICT,
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  recipient_email TEXT,
  submitted_by TEXT NOT NULL,
  accepted BOOLEAN NOT NULL,
  attempted_questions JSONB NOT NULL,
  attempted_answers JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'suppressed')),
  failure_reason TEXT,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS survey_response_receipts_pending_idx ON survey_response_receipts (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS survey_response_receipts_response_idx ON survey_response_receipts (response_id);
CREATE INDEX IF NOT EXISTS survey_response_receipts_member_idx ON survey_response_receipts (member_id, survey_id);
CREATE INDEX IF NOT EXISTS survey_response_receipts_survey_idx ON survey_response_receipts (survey_id);
CREATE TABLE IF NOT EXISTS survey_receipt_worker (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  token TEXT,
  lease_expires_at TIMESTAMPTZ
);
INSERT INTO survey_receipt_worker (singleton) VALUES (TRUE) ON CONFLICT DO NOTHING;

-- Eierskifte og innmelding krever manuell behandling. Offisielle eiendomsdata
-- endres aldri direkte fra det offentlige skjemaet.
CREATE TABLE IF NOT EXISTS member_requests (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  request_type TEXT NOT NULL CHECK (request_type IN ('ownership_transfer', 'membership')),
  status TEXT NOT NULL CHECK (status IN ('pending_verification', 'pending', 'approved', 'rejected')),
  member_id BIGINT REFERENCES members(id) ON DELETE RESTRICT,
  h_number TEXT,
  cadastral_number TEXT,
  section_number TEXT,
  street_address TEXT,
  matrikkel_review JSONB,
  requested_contact_name TEXT NOT NULL CHECK (char_length(requested_contact_name) BETWEEN 1 AND 500),
  requested_primary_email TEXT NOT NULL CHECK (char_length(requested_primary_email) <= 254),
  requested_other_emails TEXT[] NOT NULL DEFAULT '{}',
  verification_token_hash TEXT UNIQUE CHECK (verification_token_hash IS NULL OR verification_token_hash ~ '^[a-f0-9]{64}$'),
  verification_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  CHECK (
    (request_type = 'ownership_transfer' AND member_id IS NOT NULL AND status <> 'pending_verification') OR
    (request_type = 'membership' AND (h_number IS NOT NULL OR street_address IS NOT NULL))
  )
);

CREATE INDEX IF NOT EXISTS member_requests_status_idx
  ON member_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS member_requests_member_idx
  ON member_requests (member_id, created_at DESC) WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS member_requests_one_pending_transfer_idx
  ON member_requests (member_id) WHERE request_type = 'ownership_transfer' AND status = 'pending';
ALTER TABLE member_requests ADD COLUMN IF NOT EXISTS cadastral_number TEXT;
ALTER TABLE member_requests ADD COLUMN IF NOT EXISTS section_number TEXT;
ALTER TABLE member_requests ADD COLUMN IF NOT EXISTS matrikkel_review JSONB;
ALTER TABLE member_requests ADD COLUMN IF NOT EXISTS verification_environment TEXT;
ALTER TABLE member_requests ADD COLUMN IF NOT EXISTS verification_audience TEXT;
ALTER TABLE member_requests ADD COLUMN IF NOT EXISTS verification_purpose TEXT;
ALTER TABLE member_requests ADD COLUMN IF NOT EXISTS verification_consumed_at TIMESTAMPTZ;
ALTER TABLE member_requests ADD COLUMN IF NOT EXISTS requested_comment TEXT CHECK (length(requested_comment) <= 2000);

-- Minst mulig revisjonsspor for selvbetjente endringer. Tidligere og nye
-- feltverdier dupliseres ikke; bare hvilke kontaktfelt som ble endret lagres.
CREATE TABLE IF NOT EXISTS member_profile_updates (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  changed_fields TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_profile_updates_member_idx
  ON member_profile_updates (member_id, created_at DESC);
ALTER TABLE member_profile_updates ADD COLUMN IF NOT EXISTS comment TEXT CHECK (length(comment) <= 2000);
ALTER TABLE member_profile_updates ADD COLUMN IF NOT EXISTS comment_read_at TIMESTAMPTZ;
ALTER TABLE member_profile_updates ADD COLUMN IF NOT EXISTS last_changed_by TEXT;

-- Databasen identifiserer eksplisitt hvilket miljø den tilhører. Verdien settes
-- av scripts/setup-database.mjs i samme transaksjon som resten av skjemaet.
CREATE TABLE IF NOT EXISTS application_environment (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Delte, atomiske tellere gjør misbruksvernet uavhengig av hvilken Netlify-
-- instans som mottar forespørselen. Nøkler lagres bare som HMAC.
CREATE TABLE IF NOT EXISTS security_rate_limits (
  scope TEXT NOT NULL CHECK (char_length(scope) BETWEEN 1 AND 80),
  key_hash TEXT NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  bucket_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, key_hash, bucket_start)
);

CREATE INDEX IF NOT EXISTS security_rate_limits_expiry_idx
  ON security_rate_limits (expires_at);

-- Append-only logg uten rå identifikatorer, URL-er eller tokenverdier.
CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 100),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('public', 'member', 'admin', 'system')),
  result TEXT NOT NULL CHECK (char_length(result) BETWEEN 1 AND 80),
  member_id BIGINT REFERENCES members(id) ON DELETE RESTRICT,
  survey_id TEXT REFERENCES surveys(id) ON DELETE RESTRICT,
  entity_id TEXT,
  key_hmac TEXT CHECK (key_hmac IS NULL OR key_hmac ~ '^[a-f0-9]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_events_time_idx
  ON security_events (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS security_events_type_idx
  ON security_events (event_type, occurred_at DESC);

-- Personvernvennlig besøksstatistikk. Bare lavoppløselige dagsaggregater
-- lagres; tabellen har ingen rå URL, IP, brukeragent, referrer eller besøks-ID.
CREATE TABLE IF NOT EXISTS usage_daily_stats (
  day DATE NOT NULL,
  page_type TEXT NOT NULL CHECK (page_type IN ('home', 'survey', 'self_service', 'article')),
  device_category TEXT NOT NULL CHECK (device_category IN ('mobile', 'tablet', 'desktop', 'unknown')),
  views BIGINT NOT NULL DEFAULT 0 CHECK (views >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, page_type, device_category)
);

CREATE OR REPLACE FUNCTION protect_security_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $security_events$
BEGIN
  RAISE EXCEPTION 'security_events is append-only';
END;
$security_events$;

DROP TRIGGER IF EXISTS security_events_append_only_trigger ON security_events;
CREATE TRIGGER security_events_append_only_trigger
BEFORE UPDATE OR DELETE ON security_events
FOR EACH ROW EXECUTE FUNCTION protect_security_events();

ALTER TABLE email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_email_type_check;
ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_email_type_check
  CHECK (email_type IN (
    'survey_invitation', 'survey_test', 'newsletter', 'newsletter_test', 'member_access', 'membership_verification',
    'member_email_change_old', 'member_email_change_new', 'member_email_change_notice'
  ));

-- Revisjonsspor for sentrale forretningsdata. Aktørfeltet settes av applikasjonen,
-- mens triggeren gjør at også direkte databaseendringer logges som "system".
-- Hemmelige tilgangsverdier og interne lagringsnøkler tas aldri med i loggen.
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_changed_by TEXT;
ALTER TABLE member_requests ADD COLUMN IF NOT EXISTS last_changed_by TEXT;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS last_changed_by TEXT;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS last_changed_by TEXT;
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS last_changed_by TEXT;
ALTER TABLE cms_attachments ADD COLUMN IF NOT EXISTS last_changed_by TEXT;
ALTER TABLE survey_attachments ADD COLUMN IF NOT EXISTS last_changed_by TEXT;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_by TEXT NOT NULL,
  before_value JSONB,
  after_value JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_changed_at_idx
  ON audit_log (changed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx
  ON audit_log (changed_by, changed_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON audit_log (table_name, row_id, changed_at DESC);

-- Vanlige applikasjonsspørringer kan bare legge til hendelser. Ingen
-- lagringstid antas: eventuell sletting krever en separat, godkjent
-- vedlikeholdsmigrering utført av skjemaeier, aldri en admin-API-rute.
CREATE OR REPLACE FUNCTION protect_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql
AS $audit_protection$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$audit_protection$;
DROP TRIGGER IF EXISTS audit_log_append_only_trigger ON audit_log;
CREATE TRIGGER audit_log_append_only_trigger
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION protect_audit_log();
DROP TRIGGER IF EXISTS audit_log_no_truncate_trigger ON audit_log;
CREATE TRIGGER audit_log_no_truncate_trigger
BEFORE TRUNCATE ON audit_log
FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_log();
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;
DROP TRIGGER IF EXISTS security_events_no_truncate_trigger ON security_events;
CREATE TRIGGER security_events_no_truncate_trigger
BEFORE TRUNCATE ON security_events
FOR EACH STATEMENT EXECUTE FUNCTION protect_security_events();

CREATE OR REPLACE FUNCTION prepare_audit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $audit_context$
DECLARE
  actor TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM set_config('app.audit_actor', 'system', TRUE);
    RETURN OLD;
  END IF;
  actor := COALESCE(NULLIF(NEW.last_changed_by, ''), 'system');
  PERFORM set_config('app.audit_actor', actor, TRUE);
  NEW.last_changed_by := NULL;
  RETURN NEW;
END;
$audit_context$;

CREATE OR REPLACE FUNCTION record_audit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $audit$
DECLARE
  old_data JSONB;
  new_data JSONB;
  actor TEXT;
  entity_id TEXT;
BEGIN
  old_data := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  new_data := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  actor := COALESCE(NULLIF(current_setting('app.audit_actor', TRUE), ''), 'system');

  old_data := old_data - 'last_changed_by';
  new_data := new_data - 'last_changed_by';

  IF TG_TABLE_NAME = 'members' THEN
    old_data := old_data - 'access_token';
    new_data := new_data - 'access_token';
  ELSIF TG_TABLE_NAME = 'member_requests' THEN
    old_data := old_data - 'verification_token_hash';
    new_data := new_data - 'verification_token_hash';
  ELSIF TG_TABLE_NAME IN ('cms_attachments', 'survey_attachments') THEN
    old_data := old_data - 'storage_key';
    new_data := new_data - 'storage_key';
  END IF;

  IF TG_OP = 'UPDATE' AND old_data = new_data THEN
    RETURN NULL;
  END IF;

  entity_id := COALESCE(new_data ->> 'id', old_data ->> 'id', 'unknown');

  INSERT INTO audit_log (table_name, row_id, operation, changed_by, before_value, after_value)
  VALUES (TG_TABLE_NAME, entity_id, TG_OP, actor, old_data, new_data);
  RETURN NULL;
END;
$audit$;

DROP TRIGGER IF EXISTS members_audit_context_trigger ON members;
-- A read-only projection of existing delivery/campaign lifecycle timestamps.
-- Stable event IDs avoid duplicate audit inserts on polling, retries or resend.
CREATE OR REPLACE VIEW admin_activity_log AS
  SELECT 'audit:' || id::text AS id, table_name, row_id, operation, changed_by, before_value, after_value, changed_at FROM audit_log
  UNION ALL
  SELECT 'campaign:' || c.id || ':' || e.action, 'email_campaigns', c.id, 'INSERT', c.requested_by, NULL::jsonb,
    jsonb_build_object('action', e.action, 'survey_id', c.survey_id, 'group_id', c.group_id,
      'count', c.total_count, 'status', e.status,
      'sent_count', CASE WHEN e.action = 'campaign_finished' THEN c.sent_count ELSE NULL END,
      'failed_count', CASE WHEN e.action = 'campaign_finished' THEN c.failed_count ELSE NULL END), e.occurred_at
  FROM email_campaigns c CROSS JOIN LATERAL (VALUES
    ('campaign_created', c.created_at, 'pending'), ('campaign_started', c.started_at, 'running'),
    ('campaign_finished', c.completed_at, c.status)
  ) e(action, occurred_at, status) WHERE e.occurred_at IS NOT NULL
  UNION ALL
  SELECT 'testmail:' || d.id || ':' || e.action, 'email_deliveries', d.id, 'INSERT', COALESCE(d.requested_by, 'unknown'), NULL::jsonb,
    jsonb_build_object('action', e.action, 'survey_id', d.survey_id, 'newsletter_id', d.newsletter_id, 'count', 1, 'status', e.status), e.occurred_at
  FROM email_deliveries d CROSS JOIN LATERAL (VALUES
    ('testmail_requested', d.created_at, 'processing'),
    ('testmail_finished', COALESCE(d.sent_at, d.failed_at), d.status)
  ) e(action, occurred_at, status) WHERE d.email_type IN ('survey_test', 'newsletter_test') AND e.occurred_at IS NOT NULL
  UNION ALL
  SELECT 'newsletter:' || n.id || ':' || e.action, 'newsletter_campaigns', n.id, 'INSERT', n.requested_by, NULL::jsonb,
    jsonb_build_object('action', e.action, 'newsletter_id', n.id, 'status', e.status), e.occurred_at
  FROM newsletter_campaigns n CROSS JOIN LATERAL (VALUES
    ('campaign_started', n.started_at, 'running'), ('campaign_finished', n.completed_at, n.status)
  ) e(action, occurred_at, status) WHERE e.occurred_at IS NOT NULL;

CREATE TRIGGER members_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON members
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS members_audit_trigger ON members;
CREATE TRIGGER members_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON members
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

DROP TRIGGER IF EXISTS member_requests_audit_context_trigger ON member_requests;
CREATE TRIGGER member_requests_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON member_requests
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS member_requests_audit_trigger ON member_requests;
CREATE TRIGGER member_requests_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON member_requests
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

DROP TRIGGER IF EXISTS member_profile_updates_audit_context_trigger ON member_profile_updates;
CREATE TRIGGER member_profile_updates_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON member_profile_updates
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS member_profile_updates_audit_trigger ON member_profile_updates;
CREATE TRIGGER member_profile_updates_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON member_profile_updates
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

DROP TRIGGER IF EXISTS surveys_audit_context_trigger ON surveys;
CREATE TRIGGER surveys_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON surveys
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS surveys_audit_trigger ON surveys;
CREATE TRIGGER surveys_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON surveys
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

DROP TRIGGER IF EXISTS survey_responses_audit_context_trigger ON survey_responses;
CREATE TRIGGER survey_responses_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON survey_responses
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS survey_responses_audit_trigger ON survey_responses;
CREATE TRIGGER survey_responses_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON survey_responses
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

DROP TRIGGER IF EXISTS survey_attachments_audit_context_trigger ON survey_attachments;
CREATE TRIGGER survey_attachments_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON survey_attachments
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS survey_attachments_audit_trigger ON survey_attachments;
CREATE TRIGGER survey_attachments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON survey_attachments
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

DROP TRIGGER IF EXISTS cms_pages_audit_context_trigger ON cms_pages;
CREATE TRIGGER cms_pages_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON cms_pages
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS cms_pages_audit_trigger ON cms_pages;
CREATE TRIGGER cms_pages_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON cms_pages
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

DROP TRIGGER IF EXISTS cms_attachments_audit_context_trigger ON cms_attachments;
CREATE TRIGGER cms_attachments_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON cms_attachments
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS cms_attachments_audit_trigger ON cms_attachments;
CREATE TRIGGER cms_attachments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON cms_attachments
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

-- Alle gamle, miljøløse selvbetjeningslenker tilbakekalles. De tre globale
-- surveykolonnene fjernes med database/security-cleanup.sql først etter at ny
-- kode er publisert, slik at den kjørende gamle versjonen ikke krasjer under
-- den additive migreringen.
UPDATE member_access_tokens
SET revoked_at = COALESCE(revoked_at, NOW())
WHERE environment IS NULL OR audience IS NULL;

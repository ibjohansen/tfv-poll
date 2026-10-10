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

-- Én vedlikeholdsfri søkerepresentasjon gjør fritekstsøk indeksérbart. Kjør
-- utvidelsen og kolonnen før indeksen ved produksjonsmigrering; alle stegene er
-- idempotente og kan verifiseres på en Neon-gren først.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE OR REPLACE FUNCTION build_member_search_document(
  h_number TEXT, cadastral_number TEXT, section_number TEXT, street_address TEXT,
  title_holder TEXT, primary_contact_name TEXT, primary_contact_email TEXT,
  other_contact_emails TEXT[], admin_comment TEXT
) RETURNS TEXT
LANGUAGE SQL IMMUTABLE PARALLEL SAFE
RETURN lower(concat_ws(' ', h_number, cadastral_number, section_number, street_address,
  title_holder, primary_contact_name, primary_contact_email,
  array_to_string(other_contact_emails, ' '), admin_comment));
ALTER TABLE members ADD COLUMN IF NOT EXISTS search_document TEXT
  GENERATED ALWAYS AS (build_member_search_document(h_number, cadastral_number, section_number,
    street_address, title_holder, primary_contact_name, primary_contact_email,
    other_contact_emails, admin_comment)) STORED;
CREATE INDEX IF NOT EXISTS members_search_document_trgm_idx
  ON members USING GIN (search_document gin_trgm_ops) WHERE deleted_at IS NULL;

-- Årsavgift registreres per tomt og kalenderår. En eksplisitt FALSE-rad
-- skiller «ikke betalt» fra fravær av eldre historikk.
CREATE TABLE IF NOT EXISTS member_annual_fees (
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  fee_year INTEGER NOT NULL CHECK (fee_year BETWEEN 1900 AND 9999),
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  invoiced_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_by TEXT,
  PRIMARY KEY (member_id, fee_year)
);
ALTER TABLE member_annual_fees ADD COLUMN IF NOT EXISTS invoiced_on DATE;
CREATE INDEX IF NOT EXISTS member_annual_fees_year_paid_idx
  ON member_annual_fees (fee_year, paid, member_id);
CREATE INDEX IF NOT EXISTS member_annual_fees_collection_candidates_idx
  ON member_annual_fees (fee_year, member_id) WHERE invoiced_on IS NOT NULL AND paid = FALSE;

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
  completed_at TIMESTAMPTZ,
  followup_completed_at TIMESTAMPTZ,
  followup_completed_by TEXT
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
ALTER TABLE matrikkel_sync_runs ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE matrikkel_sync_runs ADD COLUMN IF NOT EXISTS scheduled_month DATE;
ALTER TABLE matrikkel_sync_runs ADD COLUMN IF NOT EXISTS followup_completed_at TIMESTAMPTZ;
ALTER TABLE matrikkel_sync_runs ADD COLUMN IF NOT EXISTS followup_completed_by TEXT;
ALTER TABLE matrikkel_sync_items ADD COLUMN IF NOT EXISTS worker_token TEXT;
ALTER TABLE matrikkel_sync_items ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matrikkel_sync_runs DROP CONSTRAINT IF EXISTS matrikkel_sync_runs_status_check;
ALTER TABLE matrikkel_sync_runs ADD CONSTRAINT matrikkel_sync_runs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));
ALTER TABLE matrikkel_sync_runs DROP CONSTRAINT IF EXISTS matrikkel_sync_runs_type_check;
ALTER TABLE matrikkel_sync_runs ADD CONSTRAINT matrikkel_sync_runs_type_check
  CHECK (run_type IN ('manual', 'monthly'));
ALTER TABLE matrikkel_sync_runs DROP CONSTRAINT IF EXISTS matrikkel_sync_runs_schedule_check;
ALTER TABLE matrikkel_sync_runs ADD CONSTRAINT matrikkel_sync_runs_schedule_check
  CHECK ((run_type = 'monthly' AND scheduled_month IS NOT NULL)
    OR (run_type = 'manual' AND scheduled_month IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS matrikkel_sync_runs_monthly_idx
  ON matrikkel_sync_runs (scheduled_month) WHERE run_type = 'monthly';

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
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS body_schema_version INTEGER NOT NULL DEFAULT 1
  CHECK (body_schema_version > 0);
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1
  CHECK (version > 0);
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS published_revision INTEGER
  CHECK (published_revision IS NULL OR published_revision > 0);
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS image_decorative BOOLEAN NOT NULL DEFAULT FALSE;
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
ALTER TABLE cms_attachments ADD COLUMN IF NOT EXISTS thumbnail_storage_key TEXT;
ALTER TABLE cms_attachments ADD COLUMN IF NOT EXISTS thumbnail_size_bytes BIGINT
  CHECK (thumbnail_size_bytes IS NULL OR thumbnail_size_bytes > 0);

-- Hver eksplisitte lagring, publisering, statusendring og gjenoppretting får
-- et komplett redaksjonelt snapshot. published_revision peker på innholdet som
-- faktisk er offentlig, slik at et nyere utkast ikke endrer en publisert side.
CREATE TABLE IF NOT EXISTS cms_page_revisions (
  page_id TEXT NOT NULL REFERENCES cms_pages(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 1500000),
  revision_status TEXT NOT NULL CHECK (revision_status IN ('draft', 'published', 'unpublished', 'restored', 'archived')),
  override_reason TEXT CHECK (override_reason IS NULL OR char_length(override_reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  PRIMARY KEY (page_id, revision_number)
);
CREATE INDEX IF NOT EXISTS cms_page_revisions_history_idx
  ON cms_page_revisions (page_id, revision_number DESC);

INSERT INTO cms_page_revisions (page_id, revision_number, snapshot, revision_status, created_by)
SELECT p.id, 1,
  jsonb_build_object(
    'schemaVersion', 1,
    'title', p.title,
    'slug', p.slug,
    'intro', p.intro,
    'body', p.body,
    'bodyRichText', p.body_rich_text,
    'bodySchemaVersion', p.body_schema_version,
    'category', p.category,
    'imageAlt', p.image_alt,
    'imageCaption', p.image_caption,
    'imageDecorative', p.image_decorative,
    'files', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'kind', a.kind, 'title', a.title,
        'originalFilename', a.original_filename, 'mimeType', a.mime_type,
        'sizeBytes', a.size_bytes, 'sortOrder', a.sort_order,
        'thumbnailStorageKey', a.thumbnail_storage_key
      ) ORDER BY a.kind DESC, a.sort_order, a.created_at, a.id)
      FROM cms_attachments a
      WHERE a.page_id = p.id AND a.deleted_at IS NULL
    ), '[]'::jsonb)
  ),
  CASE WHEN p.status = 'published' THEN 'published' ELSE 'draft' END,
  'schema-migration'
FROM cms_pages p
ON CONFLICT (page_id, revision_number) DO NOTHING;

UPDATE cms_pages
SET published_revision = 1
WHERE status = 'published' AND published_revision IS NULL;

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
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS retry_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS email_campaigns_retry_idx ON email_campaigns (retry_at)
  WHERE retry_at IS NOT NULL AND status IN ('pending', 'running', 'failed');

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

-- Redigerbare kategorier og typer. ID-ene er stabile ved navneendring.
CREATE TABLE IF NOT EXISTS activity_map_categories (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  color TEXT NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  icon_key TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS activity_map_categories_name_idx ON activity_map_categories (lower(btrim(name)));
CREATE TABLE IF NOT EXISTS activity_map_types (
  category TEXT NOT NULL REFERENCES activity_map_categories(id) ON DELETE RESTRICT,
  id TEXT NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  geometry_kind TEXT NOT NULL CHECK (geometry_kind IN ('polygon', 'line', 'point')),
  icon_key TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_by TEXT,
  PRIMARY KEY (category, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS activity_map_types_name_idx ON activity_map_types (category, lower(btrim(name)));
CREATE TABLE IF NOT EXISTS activity_map_subtypes (
  category TEXT NOT NULL,
  feature_type TEXT NOT NULL,
  id TEXT NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  icon_key TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_by TEXT,
  PRIMARY KEY (category, feature_type, id),
  FOREIGN KEY (category, feature_type) REFERENCES activity_map_types(category, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS activity_map_subtypes_name_idx ON activity_map_subtypes (category, feature_type, lower(btrim(name)));
ALTER TABLE activity_map_categories ADD COLUMN IF NOT EXISTS icon_key TEXT;
ALTER TABLE activity_map_types ADD COLUMN IF NOT EXISTS icon_key TEXT;
ALTER TABLE activity_map_subtypes ADD COLUMN IF NOT EXISTS icon_key TEXT;
ALTER TABLE activity_map_categories DROP CONSTRAINT IF EXISTS activity_map_categories_icon_key_check;
ALTER TABLE activity_map_categories ADD CONSTRAINT activity_map_categories_icon_key_check
  CHECK (icon_key IS NULL OR icon_key ~ '^activity-map/icons/[a-f0-9]{32}\.svg$');
ALTER TABLE activity_map_types DROP CONSTRAINT IF EXISTS activity_map_types_icon_key_check;
ALTER TABLE activity_map_types ADD CONSTRAINT activity_map_types_icon_key_check
  CHECK (icon_key IS NULL OR icon_key ~ '^activity-map/icons/[a-f0-9]{32}\.svg$');
ALTER TABLE activity_map_subtypes DROP CONSTRAINT IF EXISTS activity_map_subtypes_icon_key_check;
ALTER TABLE activity_map_subtypes ADD CONSTRAINT activity_map_subtypes_icon_key_check
  CHECK (icon_key IS NULL OR icon_key ~ '^activity-map/icons/[a-f0-9]{32}\.svg$');
INSERT INTO activity_map_categories (id, name, color) VALUES
  ('cycling', 'Sykkel', '#16745a'), ('alpine', 'Alpint', '#7d3147'), ('hiking', 'Tur', '#a66321'),
  ('cross_country', 'Langrenn', '#2f6fb0'), ('retail', 'Utsalg', '#00546c'), ('training', 'Trening', '#326981'),
  ('parking', 'Parkering', '#00546c'), ('wc', 'WC', '#00546c')
ON CONFLICT (id) DO NOTHING;
INSERT INTO activity_map_types (category, id, name, geometry_kind) VALUES
  ('cycling', 'trail', 'Løype', 'polygon'), ('alpine', 'trail', 'Løype', 'polygon'),
  ('alpine', 'lift', 'Heis', 'polygon'), ('alpine', 'park', 'Park', 'point'),
  ('alpine', 'sledding', 'Akebakke', 'point'), ('hiking', 'route', 'Turrute', 'line'),
  ('cross_country', 'route', 'Løype', 'line'), ('retail', 'point', 'Sted', 'point'),
  ('training', 'point', 'Trening', 'point'), ('parking', 'parking', 'Parkering', 'point'),
  ('wc', 'restroom', 'WC', 'point')
ON CONFLICT (category, id) DO NOTHING;
INSERT INTO activity_map_subtypes (category, feature_type, id, name) VALUES
  ('alpine', 'lift', 'bowl_lift', 'Skålheis'), ('alpine', 'lift', 't_bar', 'T-krok'),
  ('alpine', 'lift', 'chairlift', 'Stolheis'), ('alpine', 'lift', 'gondola', 'Gondol'),
  ('retail', 'point', 'serving', 'Servering')
ON CONFLICT (category, feature_type, id) DO NOTHING;

-- Geometri valideres også i applikasjonen.
CREATE TABLE IF NOT EXISTS activity_map_features (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  category TEXT NOT NULL,
  tooltip_text TEXT,
  activity_number TEXT,
  feature_type TEXT NOT NULL,
  feature_subtype TEXT,
  alpine_color TEXT CHECK (alpine_color IN ('blue', 'yellow', 'green', 'red', 'black')),
  geometry JSONB,
  image_storage_key TEXT,
  image_source_url TEXT,
  image_mime_type TEXT,
  image_size_bytes INTEGER,
  image_credit TEXT,
  icon_override_kind TEXT,
  icon_override_category TEXT,
  icon_override_type TEXT,
  icon_override_subtype TEXT,
  is_draft BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  last_changed_by TEXT
);
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS activity_number TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS tooltip_text TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS feature_subtype TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS season TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS image_storage_key TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS image_source_url TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS image_mime_type TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS image_size_bytes INTEGER;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS image_credit TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS icon_override_kind TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS icon_override_category TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS icon_override_type TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS icon_override_subtype TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS geometry_origin TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_geometry_origin_check;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_geometry_origin_check
  CHECK (geometry_origin IN ('manual', 'external'));
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_season_check;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_season_check
  CHECK (season IS NULL OR season IN ('summer', 'winter', 'all_year'));
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_website_check;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_website_check
  CHECK (website_url IS NULL OR (length(website_url) BETWEEN 1 AND 2048
    AND website_url ~ '^https?://[^[:space:]/@]+([/?#]|$)' AND website_url !~ '[[:space:][:cntrl:]]'));
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_image_check;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_image_check CHECK (
  (image_storage_key IS NULL AND image_source_url IS NULL AND image_mime_type IS NULL AND image_size_bytes IS NULL)
  OR (image_storage_key ~ '^activity-map/images/[a-f0-9]{32}/[a-f0-9]{32}\.webp$'
    AND image_mime_type = 'image/webp' AND image_size_bytes BETWEEN 1 AND 5242880
    AND (image_source_url IS NULL OR (length(image_source_url) BETWEEN 1 AND 2048
      AND image_source_url ~ '^https://[^[:space:]/@]+([/?#]|$)' AND image_source_url !~ '[[:space:][:cntrl:]]')))
);
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_image_credit_check;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_image_credit_check
  CHECK (image_credit IS NULL OR (length(image_credit) BETWEEN 1 AND 160
    AND image_credit = btrim(image_credit) AND image_credit !~ '[[:cntrl:]]'));
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_icon_override_check;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_icon_override_check CHECK (
  (icon_override_kind IS NULL AND icon_override_category IS NULL AND icon_override_type IS NULL AND icon_override_subtype IS NULL)
  OR (icon_override_kind = 'category' AND icon_override_category IS NOT NULL AND icon_override_type IS NULL AND icon_override_subtype IS NULL)
  OR (icon_override_kind = 'type' AND icon_override_category IS NOT NULL AND icon_override_type IS NOT NULL AND icon_override_subtype IS NULL)
  OR (icon_override_kind = 'subtype' AND icon_override_category IS NOT NULL AND icon_override_type IS NOT NULL AND icon_override_subtype IS NOT NULL)
);
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_features_category_check;
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_number_check;
ALTER TABLE activity_map_features ALTER COLUMN activity_number TYPE TEXT USING activity_number::TEXT;
ALTER TABLE activity_map_features ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE activity_map_features ALTER COLUMN geometry DROP NOT NULL;
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_features_feature_type_check;
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_type_check;
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_tooltip_text_check;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_tooltip_text_check
  CHECK (tooltip_text IS NULL OR (length(tooltip_text) BETWEEN 1 AND 300 AND tooltip_text = btrim(tooltip_text)));
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_number_check
  CHECK (activity_number IS NULL OR (length(activity_number) BETWEEN 1 AND 24
    AND activity_number = btrim(activity_number) AND activity_number !~ '[[:cntrl:]]'));
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_combination_check;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_combination_check CHECK (
  (category = 'alpine' OR activity_number IS NULL)
  AND (alpine_color IS NULL OR (category = 'alpine' AND feature_type = 'trail'))
);
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_type_fk;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_type_fk
  FOREIGN KEY (category, feature_type) REFERENCES activity_map_types(category, id) ON DELETE RESTRICT;
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_subtype_fk;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_subtype_fk
  FOREIGN KEY (category, feature_type, feature_subtype) REFERENCES activity_map_subtypes(category, feature_type, id) ON DELETE RESTRICT;
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_icon_override_category_fk;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_icon_override_category_fk
  FOREIGN KEY (icon_override_category) REFERENCES activity_map_categories(id) ON DELETE RESTRICT;
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_icon_override_type_fk;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_icon_override_type_fk
  FOREIGN KEY (icon_override_category, icon_override_type) REFERENCES activity_map_types(category, id) ON DELETE RESTRICT;
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_icon_override_subtype_fk;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_icon_override_subtype_fk
  FOREIGN KEY (icon_override_category, icon_override_type, icon_override_subtype)
  REFERENCES activity_map_subtypes(category, feature_type, id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION validate_activity_map_geometry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE expected_type TEXT;
BEGIN
  SELECT CASE geometry_kind WHEN 'polygon' THEN 'Polygon' WHEN 'line' THEN 'LineString' ELSE 'Point' END
    INTO expected_type FROM activity_map_types WHERE category = NEW.category AND id = NEW.feature_type;
  -- Eldre kladder kan ha JSON null i stedet for SQL NULL; begge betyr uten geometri.
  IF expected_type IS NULL OR (NULLIF(NEW.geometry, 'null'::jsonb) IS NOT NULL AND NEW.geometry->>'type' IS DISTINCT FROM expected_type) THEN
    RAISE EXCEPTION 'Invalid activity geometry or type' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS activity_map_geometry_trigger ON activity_map_features;
CREATE TRIGGER activity_map_geometry_trigger BEFORE INSERT OR UPDATE ON activity_map_features
FOR EACH ROW EXECUTE FUNCTION validate_activity_map_geometry();

CREATE OR REPLACE FUNCTION preserve_activity_map_type_geometry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.geometry_kind IS DISTINCT FROM OLD.geometry_kind THEN
    RAISE EXCEPTION 'Activity type geometry cannot change; create a new type' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS activity_map_types_geometry_trigger ON activity_map_types;
CREATE TRIGGER activity_map_types_geometry_trigger BEFORE UPDATE ON activity_map_types
FOR EACH ROW EXECUTE FUNCTION preserve_activity_map_type_geometry();
ALTER TABLE activity_map_features DROP CONSTRAINT IF EXISTS activity_map_feature_published_geometry_check;
ALTER TABLE activity_map_features ADD CONSTRAINT activity_map_feature_published_geometry_check
  CHECK (is_draft OR (geometry IS NOT NULL AND geometry <> 'null'::jsonb));
DROP INDEX IF EXISTS activity_map_features_public_idx;
CREATE INDEX IF NOT EXISTS activity_map_features_published_idx
  ON activity_map_features (category, feature_type, activity_number, lower(name), id)
  WHERE deleted_at IS NULL AND is_draft = FALSE AND geometry IS NOT NULL;

CREATE OR REPLACE FUNCTION increment_activity_map_feature_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS activity_map_features_version_trigger ON activity_map_features;
CREATE TRIGGER activity_map_features_version_trigger
BEFORE UPDATE ON activity_map_features
FOR EACH ROW EXECUTE FUNCTION increment_activity_map_feature_version();
DROP TRIGGER IF EXISTS activity_map_categories_version_trigger ON activity_map_categories;
CREATE TRIGGER activity_map_categories_version_trigger BEFORE UPDATE ON activity_map_categories
FOR EACH ROW EXECUTE FUNCTION increment_activity_map_feature_version();
DROP TRIGGER IF EXISTS activity_map_types_version_trigger ON activity_map_types;
CREATE TRIGGER activity_map_types_version_trigger BEFORE UPDATE ON activity_map_types
FOR EACH ROW EXECUTE FUNCTION increment_activity_map_feature_version();
DROP TRIGGER IF EXISTS activity_map_subtypes_version_trigger ON activity_map_subtypes;
CREATE TRIGGER activity_map_subtypes_version_trigger BEFORE UPDATE ON activity_map_subtypes
FOR EACH ROW EXECUTE FUNCTION increment_activity_map_feature_version();

-- Private, immutable-by-import recovery records. Never included in public APIs.
CREATE TABLE IF NOT EXISTS activity_map_import_runs (
  source_sha256 TEXT PRIMARY KEY CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_file TEXT NOT NULL,
  plan_sha256 TEXT NOT NULL CHECK (plan_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  features_before JSONB NOT NULL,
  categories_before JSONB NOT NULL,
  types_before JSONB NOT NULL,
  summary JSONB NOT NULL
);

-- Kontrollerte kilder og forhåndsvisninger for eksterne aktivitetslinjer.
-- Rå kildegeometri er privat og returneres aldri fra offentlig API.
CREATE TABLE IF NOT EXISTS activity_map_sources (
  id TEXT PRIMARY KEY CHECK (id IN ('kartverket', 'openstreetmap')),
  name TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority > 0),
  source_url TEXT NOT NULL,
  license_name TEXT NOT NULL,
  license_url TEXT NOT NULL
);
INSERT INTO activity_map_sources (id, name, priority, source_url, license_name, license_url) VALUES
  ('kartverket', 'Kartverket', 10, 'https://kartverket.no/api-og-data/friluftsliv', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/deed.no'),
  ('openstreetmap', 'OpenStreetMap', 20, 'https://www.openstreetmap.org/copyright', 'ODbL', 'https://opendatacommons.org/licenses/odbl/1-0/')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, priority = EXCLUDED.priority,
  source_url = EXCLUDED.source_url, license_name = EXCLUDED.license_name, license_url = EXCLUDED.license_url;

CREATE TABLE IF NOT EXISTS activity_map_source_runs (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  status TEXT NOT NULL CHECK (status IN ('fetching', 'preview', 'applying', 'applied', 'failed')),
  run_type TEXT NOT NULL DEFAULT 'manual' CHECK (run_type IN ('manual', 'monthly')),
  scheduled_month DATE,
  source_ids JSONB NOT NULL CHECK (jsonb_typeof(source_ids) = 'array'),
  center JSONB NOT NULL CHECK (jsonb_typeof(center) = 'array' AND jsonb_array_length(center) = 2),
  radius_km INTEGER NOT NULL CHECK (radius_km = 20),
  fetched_at TIMESTAMPTZ NOT NULL,
  raw_sha256 TEXT NOT NULL CHECK (raw_sha256 ~ '^[a-f0-9]{64}$'),
  plan_sha256 TEXT NOT NULL CHECK (plan_sha256 ~ '^[a-f0-9]{64}$'),
  summary JSONB NOT NULL CHECK (jsonb_typeof(summary) = 'object'),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  applied_at TIMESTAMPTZ,
  applied_by TEXT,
  followup_completed_at TIMESTAMPTZ,
  followup_completed_by TEXT,
  CONSTRAINT activity_map_source_runs_schedule_check CHECK (
    (run_type = 'manual' AND scheduled_month IS NULL)
    OR (run_type = 'monthly' AND scheduled_month = date_trunc('month', scheduled_month)::date)
  )
);
ALTER TABLE activity_map_source_runs ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE activity_map_source_runs ADD COLUMN IF NOT EXISTS scheduled_month DATE;
ALTER TABLE activity_map_source_runs ADD COLUMN IF NOT EXISTS followup_completed_at TIMESTAMPTZ;
ALTER TABLE activity_map_source_runs ADD COLUMN IF NOT EXISTS followup_completed_by TEXT;
ALTER TABLE activity_map_source_runs DROP CONSTRAINT IF EXISTS activity_map_source_runs_status_check;
ALTER TABLE activity_map_source_runs ADD CONSTRAINT activity_map_source_runs_status_check
  CHECK (status IN ('fetching', 'preview', 'applying', 'applied', 'failed'));
ALTER TABLE activity_map_source_runs DROP CONSTRAINT IF EXISTS activity_map_source_runs_run_type_check;
ALTER TABLE activity_map_source_runs ADD CONSTRAINT activity_map_source_runs_run_type_check
  CHECK (run_type IN ('manual', 'monthly'));
ALTER TABLE activity_map_source_runs DROP CONSTRAINT IF EXISTS activity_map_source_runs_schedule_check;
ALTER TABLE activity_map_source_runs ADD CONSTRAINT activity_map_source_runs_schedule_check CHECK (
  (run_type = 'manual' AND scheduled_month IS NULL)
  OR (run_type = 'monthly' AND scheduled_month = date_trunc('month', scheduled_month)::date)
);
CREATE INDEX IF NOT EXISTS activity_map_source_runs_created_idx ON activity_map_source_runs (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS activity_map_source_runs_monthly_idx
  ON activity_map_source_runs (scheduled_month) WHERE run_type = 'monthly';

CREATE TABLE IF NOT EXISTS activity_map_source_items (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  run_id TEXT NOT NULL REFERENCES activity_map_source_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES activity_map_sources(id) ON DELETE RESTRICT,
  external_id TEXT NOT NULL CHECK (length(external_id) BETWEEN 1 AND 300),
  source_external_id TEXT NOT NULL CHECK (length(source_external_id) BETWEEN 1 AND 300),
  source_url TEXT,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  tooltip_text TEXT,
  operator_name TEXT,
  website_url TEXT,
  source_geometry JSONB,
  display_geometry JSONB,
  status TEXT NOT NULL CHECK (status IN ('new', 'matched', 'changed', 'unchanged', 'rejected', 'missing')),
  matched_feature_id TEXT REFERENCES activity_map_features(id) ON DELETE SET NULL,
  matched_item_id TEXT REFERENCES activity_map_source_items(id) DEFERRABLE INITIALLY DEFERRED,
  match_score NUMERIC(5,4),
  match_reason TEXT,
  decision TEXT CHECK (decision IS NULL OR decision IN ('imported', 'linked', 'updated', 'rejected')),
  feature_id TEXT REFERENCES activity_map_features(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  UNIQUE (run_id, source_id, external_id)
);
CREATE INDEX IF NOT EXISTS activity_map_source_items_run_idx ON activity_map_source_items (run_id, status, source_id);

CREATE TABLE IF NOT EXISTS activity_map_feature_sources (
  feature_id TEXT NOT NULL REFERENCES activity_map_features(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES activity_map_sources(id) ON DELETE RESTRICT,
  external_id TEXT NOT NULL CHECK (length(external_id) BETWEEN 1 AND 300),
  source_url TEXT,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_by TEXT NOT NULL,
  PRIMARY KEY (source_id, external_id),
  UNIQUE (feature_id, source_id, external_id)
);
CREATE INDEX IF NOT EXISTS activity_map_feature_sources_feature_idx ON activity_map_feature_sources (feature_id, source_id);
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
  END IF;
END $$;
-- Backfill is intentionally outside the column guard. A schema-only Neon branch
-- can already contain the column before legacy fixture rows are introduced, and
-- repeated production migrations must repair any older campaign rows safely.
UPDATE email_deliveries d SET source_group_id = c.group_id
FROM email_campaigns c
WHERE d.source_group_id IS NULL AND c.id = d.campaign_id AND c.group_id IS NOT NULL;
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

-- En hashet invitasjonslenke kan opprette nye kortvarige sesjoner frem til
-- svar, tilbakekalling eller utløp. Lenkehemmeligheten lagres aldri i databasen.
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

-- Web Vitals lagres kun som dagsaggregater med grov enhetskategori. Ingen
-- side-URL, IP, brukeragent, bruker-ID eller målings-ID beholdes.
CREATE TABLE IF NOT EXISTS usage_web_vitals_daily (
  day DATE NOT NULL,
  metric_name TEXT NOT NULL CHECK (metric_name IN ('LCP', 'INP', 'CLS')),
  rating TEXT NOT NULL CHECK (rating IN ('good', 'needs-improvement', 'poor')),
  device_category TEXT NOT NULL CHECK (device_category IN ('mobile', 'tablet', 'desktop', 'unknown')),
  samples BIGINT NOT NULL DEFAULT 0 CHECK (samples >= 0),
  value_sum DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (value_sum >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, metric_name, rating, device_category)
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
    'member_email_change_old', 'member_email_change_new', 'member_email_change_notice', 'admin_task_notification', 'annual_dues'
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

-- Regnskapsoversikt: kalenderår, kontingent/budsjett som årssnapshot og private bilag.
CREATE TABLE IF NOT EXISTS accounting_years (
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 2000 AND 2099),
  annual_fee_ore BIGINT NOT NULL CHECK (annual_fee_ore BETWEEN 0 AND 100000000),
  member_count INTEGER NOT NULL CHECK (member_count BETWEEN 0 AND 100000),
  budget JSONB NOT NULL CHECK (jsonb_typeof(budget) = 'object'),
  actual_income JSONB NOT NULL CHECK (jsonb_typeof(actual_income) = 'object'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_by TEXT
);

CREATE TABLE IF NOT EXISTS accounting_expenses (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  year INTEGER NOT NULL REFERENCES accounting_years(id) ON DELETE RESTRICT,
  batch_id TEXT NOT NULL CHECK (batch_id ~ '^[a-f0-9]{32}$'),
  supplier TEXT NOT NULL CHECK (length(btrim(supplier)) BETWEEN 1 AND 160),
  invoice_number TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  category TEXT NOT NULL CHECK (category IN ('board', 'systems', 'accountant', 'trailer', 'other', 'bank')),
  invoice_date DATE NOT NULL CHECK (EXTRACT(YEAR FROM invoice_date) = year),
  currency TEXT NOT NULL CHECK (currency IN ('NOK','USD','EUR','GBP','SEK','DKK','CHF','CAD','AUD','PLN')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor BETWEEN 1 AND 100000000000),
  exchange_rate_million BIGINT NOT NULL CHECK (exchange_rate_million BETWEEN 1 AND 10000000000),
  amount_ore BIGINT GENERATED ALWAYS AS (round(amount_minor::numeric * exchange_rate_million / 1000000)::bigint) STORED
    CHECK (amount_ore BETWEEN 1 AND 100000000000),
  submitted_on DATE,
  paid_on DATE,
  notes TEXT NOT NULL DEFAULT '',
  receipt_note TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_by TEXT,
  UNIQUE (id, year),
  CHECK (currency <> 'NOK' OR exchange_rate_million = 1000000),
  CHECK (paid_on IS NULL OR (submitted_on IS NOT NULL AND paid_on >= submitted_on))
);
CREATE INDEX IF NOT EXISTS accounting_expenses_year_idx ON accounting_expenses (year, invoice_date, id);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_expenses_invoice_idx
  ON accounting_expenses (lower(btrim(supplier)), lower(btrim(invoice_number))) WHERE invoice_number <> '';

CREATE TABLE IF NOT EXISTS accounting_attachments (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  year INTEGER NOT NULL REFERENCES accounting_years(id) ON DELETE RESTRICT,
  expense_id TEXT,
  original_filename TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 3145728),
  sha256 TEXT NOT NULL UNIQUE CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  suggestion JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_by TEXT,
  FOREIGN KEY (expense_id, year) REFERENCES accounting_expenses(id, year) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS accounting_attachments_year_idx ON accounting_attachments (year, expense_id);

-- Keep the editable claimant separate from the immutable uploader and audit actor.
-- Existing records remain unknown; last_changed_by is not proof of who paid.
ALTER TABLE accounting_expenses ADD COLUMN IF NOT EXISTS claimant_name TEXT NOT NULL DEFAULT '' CHECK (length(claimant_name) <= 320);
ALTER TABLE accounting_attachments ADD COLUMN IF NOT EXISTS uploaded_by TEXT NOT NULL DEFAULT '' CHECK (length(uploaded_by) <= 320);

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
  ELSIF TG_TABLE_NAME IN ('cms_attachments', 'survey_attachments', 'accounting_attachments') THEN
    old_data := old_data - 'storage_key';
    new_data := new_data - 'storage_key';
  ELSIF TG_TABLE_NAME = 'activity_map_features' THEN
    old_data := old_data - 'image_storage_key';
    new_data := new_data - 'image_storage_key';
  END IF;

  IF TG_OP = 'UPDATE' AND old_data = new_data THEN
    RETURN NULL;
  END IF;

  entity_id := CASE WHEN TG_TABLE_NAME = 'member_annual_fees'
    THEN concat(COALESCE(new_data ->> 'member_id', old_data ->> 'member_id'), ':',
      COALESCE(new_data ->> 'fee_year', old_data ->> 'fee_year'))
    WHEN TG_TABLE_NAME = 'activity_map_types'
    THEN concat(COALESCE(new_data ->> 'category', old_data ->> 'category'), ':', COALESCE(new_data ->> 'id', old_data ->> 'id'))
    WHEN TG_TABLE_NAME = 'activity_map_subtypes'
    THEN concat(COALESCE(new_data ->> 'category', old_data ->> 'category'), ':', COALESCE(new_data ->> 'feature_type', old_data ->> 'feature_type'), ':', COALESCE(new_data ->> 'id', old_data ->> 'id'))
    ELSE COALESCE(new_data ->> 'id', old_data ->> 'id', 'unknown') END;

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

DROP TRIGGER IF EXISTS member_annual_fees_audit_context_trigger ON member_annual_fees;
CREATE TRIGGER member_annual_fees_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON member_annual_fees
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS member_annual_fees_audit_trigger ON member_annual_fees;
CREATE TRIGGER member_annual_fees_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON member_annual_fees
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

DROP TRIGGER IF EXISTS activity_map_features_audit_context_trigger ON activity_map_features;
DROP TRIGGER IF EXISTS activity_map_categories_audit_context_trigger ON activity_map_categories;
CREATE TRIGGER activity_map_categories_audit_context_trigger BEFORE INSERT OR UPDATE OR DELETE ON activity_map_categories
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS activity_map_categories_audit_trigger ON activity_map_categories;
CREATE TRIGGER activity_map_categories_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON activity_map_categories
FOR EACH ROW EXECUTE FUNCTION record_audit_change();
DROP TRIGGER IF EXISTS activity_map_types_audit_context_trigger ON activity_map_types;
CREATE TRIGGER activity_map_types_audit_context_trigger BEFORE INSERT OR UPDATE OR DELETE ON activity_map_types
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS activity_map_types_audit_trigger ON activity_map_types;
CREATE TRIGGER activity_map_types_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON activity_map_types
FOR EACH ROW EXECUTE FUNCTION record_audit_change();
DROP TRIGGER IF EXISTS activity_map_subtypes_audit_context_trigger ON activity_map_subtypes;
CREATE TRIGGER activity_map_subtypes_audit_context_trigger BEFORE INSERT OR UPDATE OR DELETE ON activity_map_subtypes
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS activity_map_subtypes_audit_trigger ON activity_map_subtypes;
CREATE TRIGGER activity_map_subtypes_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON activity_map_subtypes
FOR EACH ROW EXECUTE FUNCTION record_audit_change();
CREATE TRIGGER activity_map_features_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON activity_map_features
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS activity_map_features_audit_trigger ON activity_map_features;
CREATE TRIGGER activity_map_features_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON activity_map_features
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

-- Første katalog over alpinløyper. Faste ID-er og konfliktkontroll gjør
-- innsettingen trygg å kjøre flere ganger. Geometri fylles inn senere.
INSERT INTO activity_map_features
  (id, name, category, activity_number, feature_type, alpine_color, geometry, is_draft, last_changed_by)
VALUES
  ('798a797a571e9a1cd5a17cd6680e7655', 'Slåtteliløypa', 'alpine', '1', 'trail', 'blue', NULL, TRUE, 'system:activity-map-seed'),
  ('a926ed58cf5405a5ca500f4ff38d9df0', 'Furuløypa', 'alpine', '2', 'trail', 'green', NULL, TRUE, 'system:activity-map-seed'),
  ('ada66ad7797cb2896564eae3e9aa958e', 'Dompappen', 'alpine', '3', 'trail', 'red', NULL, TRUE, 'system:activity-map-seed'),
  ('0b4654e38e61dce92663dacaedb5d818', 'Blåbærløypa', 'alpine', '4', 'trail', 'blue', NULL, TRUE, 'system:activity-map-seed'),
  ('393dc9a29777f65633d24bac0e068c39', 'Grønnfinken', 'alpine', '5', 'trail', 'green', NULL, TRUE, 'system:activity-map-seed'),
  ('054a816f45a73b0b0eade3f77dadeae4', 'Rødreven', 'alpine', '6', 'trail', 'red', NULL, TRUE, 'system:activity-map-seed'),
  ('514225ace4b549cccb9729291409394e', 'Høgseterløypa', 'alpine', '7', 'trail', 'blue', NULL, TRUE, 'system:activity-map-seed'),
  ('b06724062a3ffe5659118a06c42c3242', 'Harahopp', 'alpine', '5', 'trail', 'green', NULL, TRUE, 'system:activity-map-seed'),
  ('105293bb391602174eb45e4ca8976f96', 'Plogen', 'alpine', '8', 'trail', 'green', NULL, TRUE, 'system:activity-map-seed'),
  ('c9b2d1d682e5c5147b4c4e30b25afef7', 'Trollskogen', 'alpine', '9', 'trail', 'blue', NULL, TRUE, 'system:activity-map-seed'),
  ('cd6cc311eacb95d1ac61570bc1d4473a', 'Eventyrskogen', 'alpine', '10', 'trail', 'blue', NULL, TRUE, 'system:activity-map-seed')
ON CONFLICT (id) DO NOTHING;

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

DROP TRIGGER IF EXISTS accounting_years_audit_context_trigger ON accounting_years;
CREATE TRIGGER accounting_years_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON accounting_years
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS accounting_years_audit_trigger ON accounting_years;
CREATE TRIGGER accounting_years_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON accounting_years
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

DROP TRIGGER IF EXISTS accounting_expenses_audit_context_trigger ON accounting_expenses;
CREATE TRIGGER accounting_expenses_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON accounting_expenses
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS accounting_expenses_audit_trigger ON accounting_expenses;
CREATE TRIGGER accounting_expenses_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON accounting_expenses
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

DROP TRIGGER IF EXISTS accounting_attachments_audit_context_trigger ON accounting_attachments;
CREATE TRIGGER accounting_attachments_audit_context_trigger
BEFORE INSERT OR UPDATE OR DELETE ON accounting_attachments
FOR EACH ROW EXECUTE FUNCTION prepare_audit_change();
DROP TRIGGER IF EXISTS accounting_attachments_audit_trigger ON accounting_attachments;
CREATE TRIGGER accounting_attachments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON accounting_attachments
FOR EACH ROW EXECUTE FUNCTION record_audit_change();

-- Alle gamle, miljøløse selvbetjeningslenker tilbakekalles. De tre globale
-- surveykolonnene fjernes med database/security-cleanup.sql først etter at ny
-- kode er publisert, slik at den kjørende gamle versjonen ikke krasjer under
-- den additive migreringen.
UPDATE member_access_tokens
SET revoked_at = COALESCE(revoked_at, NOW())
WHERE environment IS NULL OR audience IS NULL;

-- BEGIN: task-notifications
-- Additive migration: install before publishing the task notification worker.
-- Existing tasks are not backfilled. No messages are sent by this migration.
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS task_snapshot JSONB;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS task_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS task_retry_at TIMESTAMPTZ;
ALTER TABLE email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_email_type_check;
ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_email_type_check
  CHECK (email_type IN (
    'survey_invitation', 'survey_test', 'newsletter', 'newsletter_test', 'member_access', 'membership_verification',
    'member_email_change_old', 'member_email_change_new', 'member_email_change_notice', 'admin_task_notification', 'annual_dues'
  ));
CREATE INDEX IF NOT EXISTS email_deliveries_task_pending_idx
  ON email_deliveries (created_at, id)
  WHERE email_type = 'admin_task_notification' AND status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION queue_admin_task_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $task_notification$
DECLARE
  snapshot JSONB;
  plot RECORD;
BEGIN
  IF TG_TABLE_NAME = 'member_requests' THEN
    IF NEW.status NOT IN ('pending_verification', 'pending') THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('pending_verification', 'pending') THEN RETURN NEW; END IF;
    SELECT h_number, street_address INTO plot FROM members WHERE id = NEW.member_id;
    snapshot := jsonb_build_object('kind', NEW.request_type, 'status', NEW.status,
      'h_number', COALESCE(NEW.h_number, plot.h_number),
      'street_address', COALESCE(NEW.street_address, plot.street_address),
      'comment', left(NEW.requested_comment, 500));
  ELSIF TG_TABLE_NAME = 'member_profile_updates' THEN
    IF NEW.comment IS NULL OR NEW.comment_read_at IS NOT NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.comment IS NOT NULL AND OLD.comment_read_at IS NULL THEN RETURN NEW; END IF;
    SELECT h_number, street_address INTO plot FROM members WHERE id = NEW.member_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN NEW; END IF;
    snapshot := jsonb_build_object('kind', CASE WHEN NEW.comment LIKE 'MAP_IMPORT_TASK:%' THEN 'map_import' ELSE 'profile_update' END,
      'h_number', plot.h_number, 'street_address', plot.street_address,
      'changed_fields', NEW.changed_fields, 'comment', left(NEW.comment, 500));
  ELSIF TG_TABLE_NAME = 'matrikkel_sync_runs' THEN
    IF NEW.run_type <> 'monthly' OR NEW.deleted_at IS NOT NULL OR NEW.followup_completed_at IS NOT NULL
      OR NEW.status NOT IN ('completed', 'failed', 'cancelled')
      OR (NEW.status = 'completed' AND NOT (NEW.review_count > 0 OR NEW.error_count > 0)) THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.run_type = 'monthly' AND OLD.deleted_at IS NULL AND OLD.followup_completed_at IS NULL
      AND OLD.status IN ('completed', 'failed', 'cancelled')
      AND (OLD.status <> 'completed' OR OLD.review_count > 0 OR OLD.error_count > 0) THEN RETURN NEW; END IF;
    snapshot := jsonb_build_object('kind', 'matrikkel', 'status', NEW.status, 'scheduled_month', NEW.scheduled_month,
      'review_count', NEW.review_count, 'error_count', NEW.error_count, 'total_count', NEW.total_count);
  ELSIF TG_TABLE_NAME = 'activity_map_source_runs' THEN
    IF NEW.run_type <> 'monthly' OR NEW.followup_completed_at IS NOT NULL
      OR NEW.status NOT IN ('preview', 'applied', 'failed')
      OR (NEW.status <> 'failed' AND COALESCE((NEW.summary->>'new')::int, 0) + COALESCE((NEW.summary->>'matched')::int, 0)
        + COALESCE((NEW.summary->>'changed')::int, 0) + COALESCE((NEW.summary->>'missing')::int, 0) <= 0) THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.run_type = 'monthly' AND OLD.followup_completed_at IS NULL
      AND OLD.status IN ('preview', 'applied', 'failed')
      AND (OLD.status = 'failed' OR COALESCE((OLD.summary->>'new')::int, 0) + COALESCE((OLD.summary->>'matched')::int, 0)
        + COALESCE((OLD.summary->>'changed')::int, 0) + COALESCE((OLD.summary->>'missing')::int, 0) > 0) THEN RETURN NEW; END IF;
    snapshot := jsonb_build_object('kind', 'activity_map', 'status', NEW.status, 'scheduled_month', NEW.scheduled_month,
      'new_count', NEW.summary->'new', 'matched_count', NEW.summary->'matched',
      'changed_count', NEW.summary->'changed', 'missing_count', NEW.summary->'missing');
  ELSE
    RETURN NEW;
  END IF;
  snapshot := snapshot || jsonb_build_object('source_table', TG_TABLE_NAME, 'source_id', NEW.id, 'created_at', NOW());
  INSERT INTO email_deliveries (id, recipient_email, email_type, subject, task_snapshot, requested_by)
    VALUES (md5('admin_task_notification:' || TG_TABLE_NAME || ':' || NEW.id), 'post@turufjellvel.no',
      'admin_task_notification', 'Ny oppgave i Turufjell Vel', snapshot, 'system:task-notification')
    ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$task_notification$;

DROP TRIGGER IF EXISTS member_requests_task_notification_trigger ON member_requests;
CREATE TRIGGER member_requests_task_notification_trigger AFTER INSERT OR UPDATE ON member_requests
  FOR EACH ROW EXECUTE FUNCTION queue_admin_task_notification();
DROP TRIGGER IF EXISTS member_profile_updates_task_notification_trigger ON member_profile_updates;
CREATE TRIGGER member_profile_updates_task_notification_trigger AFTER INSERT OR UPDATE ON member_profile_updates
  FOR EACH ROW EXECUTE FUNCTION queue_admin_task_notification();
DROP TRIGGER IF EXISTS matrikkel_sync_runs_task_notification_trigger ON matrikkel_sync_runs;
CREATE TRIGGER matrikkel_sync_runs_task_notification_trigger AFTER INSERT OR UPDATE ON matrikkel_sync_runs
  FOR EACH ROW EXECUTE FUNCTION queue_admin_task_notification();
DROP TRIGGER IF EXISTS activity_map_source_runs_task_notification_trigger ON activity_map_source_runs;
CREATE TRIGGER activity_map_source_runs_task_notification_trigger AFTER INSERT OR UPDATE ON activity_map_source_runs
  FOR EACH ROW EXECUTE FUNCTION queue_admin_task_notification();
-- END: task-notifications

-- BEGIN annual-dues.sql (keep synchronized with the scoped migration)
-- Additive migration. Apply only after a separately approved database release.
CREATE TABLE IF NOT EXISTS annual_dues_recipients (
 member_id BIGINT PRIMARY KEY REFERENCES members(id) ON DELETE RESTRICT,
 recipient_name TEXT NOT NULL CHECK (length(btrim(recipient_name)) BETWEEN 1 AND 160),
 invoice_address TEXT NOT NULL CHECK (length(btrim(invoice_address)) BETWEEN 1 AND 320),
 confirmed_title_holder TEXT, confirmed_by TEXT NOT NULL, confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS annual_dues_campaigns (
  year INTEGER PRIMARY KEY REFERENCES accounting_years(id) ON DELETE RESTRICT,
  amount_ore BIGINT NOT NULL CHECK (amount_ore BETWEEN 1 AND 100000000),
  sender JSONB NOT NULL CHECK (jsonb_typeof(sender)='object'),
  number_prefix TEXT NOT NULL CHECK (number_prefix ~ '^[A-Z0-9-]{1,20}$'),
  next_number INTEGER NOT NULL CHECK (next_number BETWEEN 1 AND 99999999),
  created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), closed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS annual_dues_numbers (
 number TEXT PRIMARY KEY, year INTEGER NOT NULL REFERENCES annual_dues_campaigns(year),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS annual_dues_invoices (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'), year INTEGER NOT NULL REFERENCES annual_dues_campaigns(year),
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  number TEXT NOT NULL UNIQUE, issued_on DATE NOT NULL CHECK (issued_on>=make_date(year,2,1)), due_on DATE NOT NULL,
  amount_ore BIGINT NOT NULL CHECK (amount_ore BETWEEN 1 AND 100000000),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  pdf BYTEA NOT NULL CHECK (octet_length(pdf) BETWEEN 1 AND 1048576), sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  template_version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replaces_id TEXT UNIQUE REFERENCES annual_dues_invoices(id),
  CHECK (due_on=issued_on+14), UNIQUE NULLS NOT DISTINCT (member_id,year,replaces_id)
);
CREATE TABLE IF NOT EXISTS annual_dues_credits (
  invoice_id TEXT PRIMARY KEY REFERENCES annual_dues_invoices(id), number TEXT NOT NULL UNIQUE,
  year INTEGER NOT NULL REFERENCES accounting_years(id), issued_on DATE NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  pdf BYTEA NOT NULL CHECK (octet_length(pdf) BETWEEN 1 AND 1048576), sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS annual_dues_payments (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'), invoice_id TEXT NOT NULL REFERENCES annual_dues_invoices(id),
  year INTEGER NOT NULL REFERENCES accounting_years(id), paid_on DATE NOT NULL CHECK (EXTRACT(YEAR FROM paid_on)=year),
  amount_ore BIGINT NOT NULL CHECK (amount_ore BETWEEN 1 AND 100000000),
  reference TEXT NOT NULL CHECK (length(btrim(reference)) BETWEEN 1 AND 500),
  evidence TEXT NOT NULL CHECK (length(btrim(evidence)) BETWEEN 1 AND 2000),
  reverses_id TEXT UNIQUE REFERENCES annual_dues_payments(id),
  created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (year,reference)
);
CREATE INDEX IF NOT EXISTS annual_dues_payments_invoice_idx ON annual_dues_payments(invoice_id);
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS invoice_id TEXT REFERENCES annual_dues_invoices(id) ON DELETE RESTRICT;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS invoice_attempt INTEGER;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS invoice_retry_at TIMESTAMPTZ;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS invoice_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS delivery_detail JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_invoice_attempt_idx ON email_deliveries(invoice_id,invoice_attempt) WHERE invoice_id IS NOT NULL;
ALTER TABLE email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_email_type_check;
ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_email_type_check CHECK (email_type IN
 ('survey_invitation','survey_test','newsletter','newsletter_test','member_access','membership_verification',
  'member_email_change_old','member_email_change_new','member_email_change_notice','admin_task_notification','annual_dues'));
ALTER TABLE email_webhook_events ADD COLUMN IF NOT EXISTS detail JSONB;
ALTER TABLE email_webhook_events ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

-- Campaign closure records metadata only; historical balances and expenses are untouched.
ALTER TABLE accounting_years ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE accounting_years ADD COLUMN IF NOT EXISTS closed_by TEXT;
ALTER TABLE accounting_years ADD COLUMN IF NOT EXISTS closing_evidence TEXT;

-- All mutations use the same per-year lock as the existing expense API.
CREATE OR REPLACE FUNCTION finance_assert_open(p_year INTEGER) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(62719,p_year);
 IF NOT EXISTS (SELECT 1 FROM accounting_years WHERE id=p_year AND closed_at IS NULL) THEN
  RAISE EXCEPTION 'financeYearClosed' USING ERRCODE='P0001';
 END IF;
END $$;

-- Conservative ownership check: missing or conflicting owner dates require review.
CREATE OR REPLACE FUNCTION annual_dues_eligibility(p_date TEXT,p_year INTEGER) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE raw TEXT; d DATE; before_count INTEGER:=0; after_count INTEGER:=0;
BEGIN
 IF nullif(btrim(p_date),'') IS NULL THEN RETURN 'review'; END IF;
 FOREACH raw IN ARRAY regexp_split_to_array(btrim(p_date),'[[:space:]]*/[[:space:]]*') LOOP
  IF raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN 'review'; END IF;
  BEGIN d:=raw::DATE; EXCEPTION WHEN OTHERS THEN RETURN 'review'; END;
  IF to_char(d,'YYYY-MM-DD')<>raw THEN RETURN 'review'; END IF;
  IF d>make_date(p_year,2,1) THEN after_count:=after_count+1; ELSE before_count:=before_count+1; END IF;
 END LOOP;
 IF after_count>0 AND before_count>0 THEN RETURN 'review'; END IF;
 IF after_count>0 THEN RETURN 'after_cutoff'; END IF;
 RETURN 'eligible';
END $$;

CREATE OR REPLACE FUNCTION annual_dues_prepare(p_member BIGINT,p_name TEXT,p_address TEXT,p_owner TEXT,p_actor TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE m members;
BEGIN
 SELECT * INTO m FROM members WHERE id=p_member AND deleted_at IS NULL FOR UPDATE;
 IF m.id IS NULL OR m.title_holder IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'memberChanged'; END IF;
 INSERT INTO annual_dues_recipients(member_id,recipient_name,invoice_address,confirmed_title_holder,confirmed_by)
 VALUES(p_member,p_name,p_address,p_owner,p_actor)
 ON CONFLICT(member_id) DO UPDATE SET recipient_name=EXCLUDED.recipient_name,invoice_address=EXCLUDED.invoice_address,
 confirmed_title_holder=EXCLUDED.confirmed_title_holder,confirmed_by=EXCLUDED.confirmed_by,confirmed_at=NOW();
 INSERT INTO audit_log(table_name,row_id,operation,changed_by,after_value)
 VALUES('annual_dues_recipients',p_member::TEXT,'INSERT',p_actor,jsonb_build_object('recipient_name',p_name,'invoice_address',p_address,'confirmed_title_holder',p_owner));
END $$;

CREATE OR REPLACE FUNCTION finance_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutableFinanceRecord' USING ERRCODE='P0001'; END $$;

CREATE OR REPLACE FUNCTION annual_dues_open(p_year INTEGER,p_amount BIGINT,p_sender JSONB,p_prefix TEXT,p_first INTEGER,p_actor TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 PERFORM finance_assert_open(p_year);
 IF EXISTS (SELECT 1 FROM annual_dues_campaigns WHERE year=p_year) THEN RAISE EXCEPTION 'campaignExists'; END IF;
 IF p_amount<>(SELECT annual_fee_ore FROM accounting_years WHERE id=p_year) THEN RAISE EXCEPTION 'campaignAmountMismatch'; END IF;
 IF EXISTS (SELECT 1 FROM member_annual_fees WHERE fee_year=p_year AND (paid OR invoiced_on IS NOT NULL)) THEN RAISE EXCEPTION 'legacyFeesNeedReview'; END IF;
 INSERT INTO annual_dues_campaigns(year,amount_ore,sender,number_prefix,next_number,created_by) VALUES(p_year,p_amount,p_sender,p_prefix,p_first,p_actor);
END $$;
CREATE OR REPLACE FUNCTION annual_dues_issue(p_id TEXT,p_year INTEGER,p_member BIGINT,p_date DATE,p_number TEXT,p_snapshot JSONB,p_pdf TEXT,p_sha TEXT,p_actor TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE c annual_dues_campaigns; m members;
BEGIN
 IF EXISTS (SELECT 1 FROM annual_dues_invoices WHERE id=p_id AND year=p_year AND member_id=p_member AND issued_on=p_date AND snapshot=p_snapshot) THEN RETURN; END IF;
 PERFORM finance_assert_open(p_year);
 SELECT * INTO c FROM annual_dues_campaigns WHERE year=p_year AND closed_at IS NULL FOR UPDATE;
 IF c.year IS NULL THEN RAISE EXCEPTION 'campaignClosed'; END IF;
 SELECT * INTO m FROM members WHERE id=p_member AND deleted_at IS NULL AND membership_status='member' FOR UPDATE;
 IF m.id IS NULL OR nullif(btrim(m.h_number),'') IS NULL THEN RAISE EXCEPTION 'memberChanged'; END IF;
 IF annual_dues_eligibility(m.registration_date,p_year)<>'eligible' THEN RAISE EXCEPTION 'ownershipDateExcluded'; END IF;
 IF p_date<make_date(p_year,2,1) THEN RAISE EXCEPTION 'beforeCutoff'; END IF;
 IF p_date>(NOW() AT TIME ZONE 'Europe/Oslo')::DATE THEN RAISE EXCEPTION 'invalidDate'; END IF;
 IF m.registration_date IS DISTINCT FROM p_snapshot->>'registration_date' THEN RAISE EXCEPTION 'memberChanged'; END IF;
 IF m.primary_contact_name IS DISTINCT FROM p_snapshot->>'contact_name' OR m.primary_contact_email IS DISTINCT FROM p_snapshot->>'source_email'
   OR m.title_holder IS DISTINCT FROM p_snapshot->>'title_holder' OR m.h_number IS DISTINCT FROM p_snapshot->>'h_number'
   OR m.street_address IS DISTINCT FROM p_snapshot->>'street_address' THEN RAISE EXCEPTION 'memberChanged'; END IF;
 IF p_number <> c.number_prefix || c.next_number::TEXT THEN RAISE EXCEPTION 'numberConflict'; END IF;
 PERFORM annual_dues_prepare(p_member,p_snapshot->>'recipient_name',p_snapshot->>'invoice_address',m.title_holder,p_actor);
 IF p_snapshot->>'replaces_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM annual_dues_invoices old JOIN annual_dues_credits cr ON cr.invoice_id=old.id WHERE old.id=p_snapshot->>'replaces_id' AND old.member_id=p_member AND old.year=p_year) THEN RAISE EXCEPTION 'invalidReplacement'; END IF;
 INSERT INTO annual_dues_numbers(number,year) VALUES(p_number,p_year);
 INSERT INTO annual_dues_invoices(id,year,member_id,number,issued_on,due_on,amount_ore,snapshot,pdf,sha256,created_by,replaces_id)
 VALUES(p_id,p_year,p_member,p_number,p_date,p_date+14,c.amount_ore,p_snapshot,decode(p_pdf,'base64'),p_sha,p_actor,p_snapshot->>'replaces_id');
 UPDATE annual_dues_campaigns SET next_number=next_number+1 WHERE year=p_year;
 INSERT INTO member_annual_fees(member_id,fee_year,paid,last_changed_by) SELECT p_member,p_year,FALSE,p_actor
 WHERE NOT EXISTS (SELECT 1 FROM member_annual_fees WHERE member_id=p_member AND fee_year=p_year)
 ON CONFLICT(member_id,fee_year) DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION annual_dues_queue(p_id TEXT,p_invoice TEXT,p_email TEXT,p_actor TEXT,p_owner_confirmed BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE i annual_dues_invoices; m members; attempt INTEGER;
BEGIN
 SELECT * INTO i FROM annual_dues_invoices WHERE id=p_invoice;
 IF i.id IS NULL THEN RAISE EXCEPTION 'missingInvoice'; END IF;
 PERFORM finance_assert_open(i.year);
 SELECT * INTO m FROM members WHERE id=i.member_id AND deleted_at IS NULL AND membership_status='member' FOR UPDATE;
 IF m.id IS NULL OR m.primary_contact_email IS DISTINCT FROM p_email THEN RAISE EXCEPTION 'memberChanged'; END IF;
 IF annual_dues_eligibility(m.registration_date,i.year)<>'eligible' THEN RAISE EXCEPTION 'ownershipDateExcluded'; END IF;
 IF m.title_holder IS DISTINCT FROM i.snapshot->>'title_holder' OR m.registration_date IS DISTINCT FROM i.snapshot->>'registration_date' THEN RAISE EXCEPTION 'ownerReviewRequired'; END IF;
 IF EXISTS (SELECT 1 FROM annual_dues_credits WHERE invoice_id=i.id) OR
   coalesce((SELECT sum(CASE WHEN reverses_id IS NULL THEN amount_ore ELSE -amount_ore END) FROM annual_dues_payments WHERE invoice_id=i.id),0)>=i.amount_ore THEN RAISE EXCEPTION 'invoiceSettled'; END IF;
 IF EXISTS (SELECT 1 FROM email_deliveries WHERE invoice_id=i.id AND status IN ('pending','processing')) THEN RAISE EXCEPTION 'deliveryPending'; END IF;
 SELECT coalesce(max(invoice_attempt),0)+1 INTO attempt FROM email_deliveries WHERE invoice_id=i.id;
 INSERT INTO email_deliveries(id,member_id,recipient_email,email_type,subject,invoice_id,invoice_attempt,requested_by)
 VALUES(p_id,i.member_id,p_email,'annual_dues','Årskontingent '||i.year||' – Turufjell Vel – '||i.number,i.id,attempt,p_actor);
END $$;
CREATE OR REPLACE FUNCTION annual_dues_pay(p_id TEXT,p_invoice TEXT,p_year INTEGER,p_date DATE,p_amount BIGINT,p_ref TEXT,p_evidence TEXT,p_reverses TEXT,p_actor TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE i annual_dues_invoices; prev annual_dues_payments; total_paid BIGINT; delta BIGINT;
BEGIN
 PERFORM finance_assert_open(p_year);
 SELECT * INTO i FROM annual_dues_invoices WHERE id=p_invoice FOR UPDATE;
 IF i.id IS NULL OR p_date<i.issued_on THEN RAISE EXCEPTION 'invalidPayment'; END IF;
 IF EXISTS (SELECT 1 FROM annual_dues_payments WHERE id=p_id AND invoice_id=p_invoice AND year=p_year AND paid_on=p_date AND amount_ore=p_amount AND reference=p_ref AND evidence=p_evidence AND reverses_id IS NOT DISTINCT FROM p_reverses) THEN RETURN; END IF;
 SELECT coalesce(sum(CASE WHEN reverses_id IS NULL THEN amount_ore ELSE -amount_ore END),0) INTO total_paid FROM annual_dues_payments WHERE invoice_id=i.id;
 delta:=p_amount;
 IF p_reverses IS NOT NULL THEN
  SELECT * INTO prev FROM annual_dues_payments WHERE id=p_reverses AND invoice_id=i.id AND reverses_id IS NULL;
  IF prev.id IS NULL OR prev.amount_ore<>p_amount OR p_date<prev.paid_on THEN RAISE EXCEPTION 'invalidReversal'; END IF;
  delta:=-p_amount;
 ELSIF EXISTS (SELECT 1 FROM annual_dues_credits WHERE invoice_id=i.id) OR total_paid+p_amount>i.amount_ore THEN RAISE EXCEPTION 'overpayment';
 END IF;
 IF p_year<>i.year AND NOT EXISTS (SELECT 1 FROM accounting_years WHERE id=i.year AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'previousYearNotClosed'; END IF;
 INSERT INTO annual_dues_payments(id,invoice_id,year,paid_on,amount_ore,reference,evidence,reverses_id,created_by)
 VALUES(p_id,i.id,p_year,p_date,p_amount,p_ref,p_evidence,p_reverses,p_actor);
 UPDATE member_annual_fees SET paid=total_paid+delta=i.amount_ore,last_changed_by=p_actor,updated_at=NOW() WHERE member_id=i.member_id AND fee_year=i.year;
END $$;
CREATE OR REPLACE FUNCTION annual_dues_credit(p_invoice TEXT,p_year INTEGER,p_date DATE,p_number TEXT,p_reason TEXT,p_pdf TEXT,p_sha TEXT,p_actor TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE i annual_dues_invoices; c annual_dues_campaigns; paid BIGINT;
BEGIN
 IF EXISTS (SELECT 1 FROM annual_dues_credits WHERE invoice_id=p_invoice AND year=p_year AND issued_on=p_date AND reason=p_reason) THEN RETURN; END IF;
 PERFORM finance_assert_open(p_year);
 SELECT * INTO i FROM annual_dues_invoices WHERE id=p_invoice FOR UPDATE;
 IF i.id IS NULL OR p_date<i.issued_on THEN RAISE EXCEPTION 'invalidCredit'; END IF;
 IF EXISTS (SELECT 1 FROM email_deliveries WHERE invoice_id=i.id AND status='processing') THEN RAISE EXCEPTION 'deliveryPending'; END IF;
 SELECT coalesce(sum(CASE WHEN reverses_id IS NULL THEN amount_ore ELSE -amount_ore END),0) INTO paid FROM annual_dues_payments WHERE invoice_id=i.id;
 IF paid<>0 THEN RAISE EXCEPTION 'creditHasPayments'; END IF;
 SELECT * INTO c FROM annual_dues_campaigns WHERE year=p_year FOR UPDATE;
 IF p_number<>c.number_prefix||c.next_number::TEXT OR c.year IS NULL THEN RAISE EXCEPTION 'numberConflict'; END IF;
 INSERT INTO annual_dues_numbers(number,year) VALUES(p_number,p_year);
 INSERT INTO annual_dues_credits(invoice_id,number,year,issued_on,reason,pdf,sha256,created_by)
 VALUES(i.id,p_number,p_year,p_date,p_reason,decode(p_pdf,'base64'),p_sha,p_actor);
 UPDATE annual_dues_campaigns SET next_number=next_number+1 WHERE year=p_year;
 UPDATE email_deliveries SET status='failed',failure_reason='INVOICE_CREDITED',failed_at=NOW() WHERE invoice_id=i.id AND status='pending';
END $$;

CREATE OR REPLACE FUNCTION finance_close(p_year INTEGER,p_actor TEXT,p_evidence TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 PERFORM finance_assert_open(p_year);
 IF length(btrim(p_evidence))=0 THEN RAISE EXCEPTION 'evidenceRequired'; END IF;
 IF EXISTS (SELECT 1 FROM email_deliveries d JOIN annual_dues_invoices i ON i.id=d.invoice_id WHERE i.year=p_year AND d.status IN ('pending','processing')) THEN RAISE EXCEPTION 'deliveryPending'; END IF;
 UPDATE annual_dues_campaigns SET closed_at=NOW() WHERE year=p_year;
 UPDATE accounting_years SET closed_at=NOW(),closed_by=p_actor,closing_evidence=p_evidence WHERE id=p_year;
END $$;

-- Block the old boolean-only fee APIs once a financial campaign exists.
CREATE OR REPLACE FUNCTION annual_dues_legacy_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM annual_dues_campaigns WHERE year=NEW.fee_year) AND (
  NEW.paid IS DISTINCT FROM EXISTS (SELECT 1 FROM annual_dues_invoices i WHERE i.member_id=NEW.member_id AND i.year=NEW.fee_year
   AND NOT EXISTS (SELECT 1 FROM annual_dues_credits cr WHERE cr.invoice_id=i.id)
   AND coalesce((SELECT sum(CASE WHEN p.reverses_id IS NULL THEN p.amount_ore ELSE -p.amount_ore END) FROM annual_dues_payments p WHERE p.invoice_id=i.id),0)=i.amount_ore)
  OR NEW.invoiced_on IS DISTINCT FROM (SELECT min(d.sent_at AT TIME ZONE 'Europe/Oslo')::date FROM email_deliveries d JOIN annual_dues_invoices all_i ON all_i.id=d.invoice_id WHERE all_i.member_id=NEW.member_id AND all_i.year=NEW.fee_year)
 ) THEN RAISE EXCEPTION 'useDocumentedPayments'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS annual_dues_legacy_guard ON member_annual_fees;
CREATE TRIGGER annual_dues_legacy_guard BEFORE INSERT OR UPDATE ON member_annual_fees FOR EACH ROW EXECUTE FUNCTION annual_dues_legacy_guard();
CREATE OR REPLACE FUNCTION finance_year_settings_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.closed_at IS NOT NULL THEN RAISE EXCEPTION 'financeYearClosed'; END IF;
 IF EXISTS (SELECT 1 FROM annual_dues_campaigns WHERE year=OLD.id) AND NEW.annual_fee_ore<>OLD.annual_fee_ore THEN RAISE EXCEPTION 'campaignAmountLocked'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS accounting_years_finance_guard ON accounting_years;
CREATE TRIGGER accounting_years_finance_guard BEFORE UPDATE ON accounting_years FOR EACH ROW EXECUTE FUNCTION finance_year_settings_guard();
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['annual_dues_numbers','annual_dues_invoices','annual_dues_credits','annual_dues_payments'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS finance_immutable_trigger ON %I',t);
  EXECUTE format('CREATE TRIGGER finance_immutable_trigger BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_immutable()',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION annual_dues_closed_expense_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(62719,coalesce(NEW.year,OLD.year));
 IF EXISTS (SELECT 1 FROM accounting_years WHERE id=coalesce(NEW.year,OLD.year) AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'financeYearClosed'; END IF;
 RETURN coalesce(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS annual_dues_closed_expense_guard ON accounting_expenses;
CREATE TRIGGER annual_dues_closed_expense_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_expenses FOR EACH ROW EXECUTE FUNCTION annual_dues_closed_expense_guard();

-- END annual-dues.sql

-- BEGIN invoice-settings.sql (keep synchronized with the scoped migration)
-- Additive sender settings. Existing campaigns and archived documents are untouched.
ALTER TABLE annual_dues_campaigns ADD COLUMN IF NOT EXISTS tax_treatment JSONB NOT NULL
 DEFAULT '{"type":"exempt","reason":"Årskontingent","text":"Årskontingent unntatt merverdiavgift"}'::jsonb
 CHECK (tax_treatment='{"type":"exempt","reason":"Årskontingent","text":"Årskontingent unntatt merverdiavgift"}'::jsonb);
DROP TRIGGER IF EXISTS annual_dues_tax_immutable ON annual_dues_campaigns;
CREATE TRIGGER annual_dues_tax_immutable BEFORE UPDATE OF tax_treatment ON annual_dues_campaigns FOR EACH ROW EXECUTE FUNCTION finance_immutable();
CREATE TABLE IF NOT EXISTS finance_invoice_settings (
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
 sender_address TEXT NOT NULL CHECK (length(btrim(sender_address)) BETWEEN 1 AND 320),
 bank_account TEXT CHECK (bank_account ~ '^[0-9]{11}$'),
 contact JSONB NOT NULL CHECK (jsonb_typeof(contact)='object'),
 version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
 updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO finance_invoice_settings(singleton,sender_address,bank_account,contact,updated_by)
VALUES(TRUE,E'TURUFJELL VEL\nc/o Ib Johansen\nElvemo 18\n3539 FLÅ',NULL,
 '{"name":"Turufjell Vel","organization_number":"928968898","phone":"416 01 917","reply_to":"post@turufjellvel.no","website":"www.turufjellvel.no"}',
 'release:user-provided') ON CONFLICT(singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION finance_invoice_settings_save(p_version INTEGER,p_address TEXT,p_bank TEXT,p_contact JSONB,p_actor TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE previous finance_invoice_settings; saved finance_invoice_settings;
BEGIN
 PERFORM pg_advisory_xact_lock(62719,-1);
 SELECT * INTO previous FROM finance_invoice_settings WHERE singleton=TRUE FOR UPDATE;
 IF p_version IS DISTINCT FROM coalesce(previous.version,0) THEN RAISE EXCEPTION 'invoiceSettingsChanged' USING ERRCODE='P0001'; END IF;
 INSERT INTO finance_invoice_settings(singleton,sender_address,bank_account,contact,updated_by)
 VALUES(TRUE,p_address,p_bank,p_contact,p_actor)
 ON CONFLICT(singleton) DO UPDATE SET sender_address=EXCLUDED.sender_address,bank_account=EXCLUDED.bank_account,
  contact=EXCLUDED.contact,version=finance_invoice_settings.version+1,updated_by=p_actor,updated_at=NOW()
 RETURNING * INTO saved;
 INSERT INTO audit_log(table_name,row_id,operation,changed_by,before_value,after_value)
 VALUES('finance_invoice_settings','true',CASE WHEN previous.version IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
  p_actor,CASE WHEN previous.version IS NOT NULL THEN to_jsonb(previous) ELSE NULL END,to_jsonb(saved));
END $$;

-- Prevent a settings change while a reviewed PDF is being generated from stale values.
CREATE OR REPLACE FUNCTION finance_invoice_sender_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE settings finance_invoice_settings; sender JSONB;
BEGIN
 SELECT * INTO settings FROM finance_invoice_settings WHERE singleton=TRUE FOR SHARE;
 IF TG_TABLE_NAME='annual_dues_campaigns' THEN
  sender:=NEW.sender;
  IF sender->>'vat' IS DISTINCT FROM NEW.tax_treatment->>'text' THEN RAISE EXCEPTION 'vatReviewRequired' USING ERRCODE='P0001'; END IF;
 ELSE
  sender:=NEW.snapshot->'sender';NEW.template_version:=2;
 END IF;
 IF settings.version IS NULL OR settings.bank_account IS NULL OR sender->>'address' IS DISTINCT FROM settings.sender_address
  OR sender->>'bank_account' IS DISTINCT FROM settings.bank_account
  OR sender->>'settings_version' IS DISTINCT FROM settings.version::TEXT THEN
  RAISE EXCEPTION 'invoiceSettingsChanged' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS finance_invoice_sender_guard ON annual_dues_campaigns;
CREATE TRIGGER finance_invoice_sender_guard BEFORE INSERT ON annual_dues_campaigns FOR EACH ROW EXECUTE FUNCTION finance_invoice_sender_guard();
DROP TRIGGER IF EXISTS finance_invoice_sender_guard ON annual_dues_invoices;
CREATE TRIGGER finance_invoice_sender_guard BEFORE INSERT ON annual_dues_invoices FOR EACH ROW EXECUTE FUNCTION finance_invoice_sender_guard();
-- END invoice-settings.sql

-- BEGIN annual-dues-auto-recipients.sql (keep synchronized with the scoped migration)
-- Use the verified member register directly for year-contingent invoices.
-- Existing prepared recipients and archived invoices remain historical records.
CREATE OR REPLACE FUNCTION annual_dues_issue(p_id TEXT,p_year INTEGER,p_member BIGINT,p_date DATE,p_number TEXT,p_snapshot JSONB,p_pdf TEXT,p_sha TEXT,p_actor TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE c annual_dues_campaigns; m members;
BEGIN
 IF EXISTS (SELECT 1 FROM annual_dues_invoices WHERE id=p_id AND year=p_year AND member_id=p_member AND issued_on=p_date AND snapshot=p_snapshot) THEN RETURN; END IF;
 PERFORM finance_assert_open(p_year);
 SELECT * INTO c FROM annual_dues_campaigns WHERE year=p_year AND closed_at IS NULL FOR UPDATE;
 IF c.year IS NULL THEN RAISE EXCEPTION 'campaignClosed'; END IF;
 SELECT * INTO m FROM members WHERE id=p_member AND deleted_at IS NULL AND membership_status='member' FOR UPDATE;
 IF m.id IS NULL OR nullif(btrim(m.h_number),'') IS NULL THEN RAISE EXCEPTION 'memberChanged'; END IF;
 IF annual_dues_eligibility(m.registration_date,p_year)<>'eligible' THEN RAISE EXCEPTION 'ownershipDateExcluded'; END IF;
 IF p_date<make_date(p_year,2,1) THEN RAISE EXCEPTION 'beforeCutoff'; END IF;
 IF p_date>(NOW() AT TIME ZONE 'Europe/Oslo')::DATE THEN RAISE EXCEPTION 'invalidDate'; END IF;
 IF m.registration_date IS DISTINCT FROM p_snapshot->>'registration_date' THEN RAISE EXCEPTION 'memberChanged'; END IF;
 IF m.primary_contact_name IS DISTINCT FROM p_snapshot->>'contact_name' OR m.primary_contact_email IS DISTINCT FROM p_snapshot->>'source_email'
   OR m.title_holder IS DISTINCT FROM p_snapshot->>'title_holder' OR m.h_number IS DISTINCT FROM p_snapshot->>'h_number'
   OR m.street_address IS DISTINCT FROM p_snapshot->>'street_address' THEN RAISE EXCEPTION 'memberChanged'; END IF;
 IF p_number <> c.number_prefix || c.next_number::TEXT THEN RAISE EXCEPTION 'numberConflict'; END IF;
 IF p_snapshot->>'replaces_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM annual_dues_invoices old JOIN annual_dues_credits cr ON cr.invoice_id=old.id WHERE old.id=p_snapshot->>'replaces_id' AND old.member_id=p_member AND old.year=p_year) THEN RAISE EXCEPTION 'invalidReplacement'; END IF;
 INSERT INTO annual_dues_numbers(number,year) VALUES(p_number,p_year);
 INSERT INTO annual_dues_invoices(id,year,member_id,number,issued_on,due_on,amount_ore,snapshot,pdf,sha256,created_by,replaces_id)
 VALUES(p_id,p_year,p_member,p_number,p_date,p_date+14,c.amount_ore,p_snapshot,decode(p_pdf,'base64'),p_sha,p_actor,p_snapshot->>'replaces_id');
 UPDATE annual_dues_campaigns SET next_number=next_number+1 WHERE year=p_year;
 INSERT INTO member_annual_fees(member_id,fee_year,paid,last_changed_by) SELECT p_member,p_year,FALSE,p_actor
 WHERE NOT EXISTS (SELECT 1 FROM member_annual_fees WHERE member_id=p_member AND fee_year=p_year)
 ON CONFLICT(member_id,fee_year) DO NOTHING;
END $$;
-- END annual-dues-auto-recipients.sql

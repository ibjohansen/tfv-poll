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

-- Medlems-ID genereres tilfeldig, uavhengig av tomteopplysningene.
CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  access_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '')
    CHECK (access_token ~ '^[a-f0-9]{32}$'),
  h_number TEXT NOT NULL,
  cadastral_number TEXT,
  street_address TEXT,
  title_holder TEXT,
  registration_date TEXT,
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  other_contact_emails TEXT[] NOT NULL DEFAULT '{}'
  ,access_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days')
  ,access_revoked_at TIMESTAMPTZ
  ,deleted_at TIMESTAMPTZ
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

CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_member_survey_idx
  ON survey_responses (member_id, survey_id);

-- Adminfelt og stabil importidentitet. Flere medlemmer kan vente på H-nummer.
ALTER TABLE members ADD COLUMN IF NOT EXISTS admin_comment TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS import_key TEXT UNIQUE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days');
ALTER TABLE members ADD COLUMN IF NOT EXISTS access_revoked_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS matrikkel_sync_backups (
  run_id TEXT NOT NULL REFERENCES matrikkel_sync_runs(id) ON DELETE RESTRICT,
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  cadastral_number TEXT,
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
ALTER TABLE matrikkel_sync_runs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
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

-- Kun for test av rollback på en isolert Neon-gren før produksjonssetting.
-- Dette fjerner revisjonshistorikken og må aldri kjøres mot produksjon etter at
-- den nye CMS-koden er tatt i bruk.
BEGIN;

DROP TABLE IF EXISTS cms_page_revisions;
ALTER TABLE cms_attachments DROP COLUMN IF EXISTS thumbnail_size_bytes;
ALTER TABLE cms_attachments DROP COLUMN IF EXISTS thumbnail_storage_key;
ALTER TABLE cms_pages DROP COLUMN IF EXISTS image_decorative;
ALTER TABLE cms_pages DROP COLUMN IF EXISTS published_revision;
ALTER TABLE cms_pages DROP COLUMN IF EXISTS version;
ALTER TABLE cms_pages DROP COLUMN IF EXISTS body_schema_version;

COMMIT;

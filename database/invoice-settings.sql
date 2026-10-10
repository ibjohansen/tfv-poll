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

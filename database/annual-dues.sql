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

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

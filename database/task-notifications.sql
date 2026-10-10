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

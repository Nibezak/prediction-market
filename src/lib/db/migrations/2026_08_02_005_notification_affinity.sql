ALTER TABLE push_deliveries ADD COLUMN IF NOT EXISTS opened_at timestamptz;

CREATE TABLE IF NOT EXISTS event_notification_dispatches (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(),
  event_id char(26) NOT NULL REFERENCES events(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  category_slug text NOT NULL,
  affinity_score integer NOT NULL,
  notification_id char(26) REFERENCES notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_notification_dispatches_event_user_key UNIQUE(event_id, user_id)
);
CREATE INDEX IF NOT EXISTS event_notification_dispatches_user_created_idx ON event_notification_dispatches(user_id, created_at);

ALTER TABLE event_notification_dispatches ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  policy_role text;
BEGIN
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN 'service_role'
    ELSE current_user
  END INTO policy_role;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_notification_dispatches' AND policyname = 'event_notification_dispatches_service_only') THEN
    EXECUTE format('CREATE POLICY event_notification_dispatches_service_only ON event_notification_dispatches FOR ALL TO %I USING (true) WITH CHECK (true)', policy_role);
  END IF;
END $$;

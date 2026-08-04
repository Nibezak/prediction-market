CREATE TABLE IF NOT EXISTS push_subscriptions (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  user_agent text,
  locale text NOT NULL DEFAULT 'en',
  timezone text,
  enabled boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_enabled_idx ON push_subscriptions(user_id, enabled);

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(),
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'platform',
  link_url text,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  use_ai_copy boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft',
  scheduled_for timestamptz,
  sent_at timestamptz,
  audience_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_campaigns_status_schedule_idx ON notification_campaigns(status, scheduled_for);

CREATE TABLE IF NOT EXISTS push_deliveries (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(),
  notification_id char(26) NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  subscription_id char(26) NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  campaign_id char(26) REFERENCES notification_campaigns(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  error_code text,
  attempted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_deliveries_notification_subscription_key UNIQUE(notification_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS push_deliveries_status_idx ON push_deliveries(status);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_deliveries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_role text;
BEGIN
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN 'service_role'
    ELSE current_user
  END INTO policy_role;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_service_only') THEN
    EXECUTE format('CREATE POLICY push_subscriptions_service_only ON push_subscriptions FOR ALL TO %I USING (true) WITH CHECK (true)', policy_role);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_campaigns' AND policyname = 'notification_campaigns_service_only') THEN
    EXECUTE format('CREATE POLICY notification_campaigns_service_only ON notification_campaigns FOR ALL TO %I USING (true) WITH CHECK (true)', policy_role);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_deliveries' AND policyname = 'push_deliveries_service_only') THEN
    EXECUTE format('CREATE POLICY push_deliveries_service_only ON push_deliveries FOR ALL TO %I USING (true) WITH CHECK (true)', policy_role);
  END IF;
END $$;

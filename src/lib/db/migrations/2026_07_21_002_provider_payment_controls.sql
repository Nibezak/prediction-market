CREATE TABLE IF NOT EXISTS provider_webhook_events (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payment_intent_id char(26) REFERENCES payment_intents(id) ON DELETE RESTRICT,
  payload_hash text NOT NULL,
  signature_digest text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','ignored','failed')),
  failure_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS idx_provider_webhook_intent ON provider_webhook_events(payment_intent_id, received_at DESC);

CREATE TABLE IF NOT EXISTS payment_disputes (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(),
  payment_intent_id char(26) NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_dispute_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','won','lost','cancelled')),
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE(provider, provider_dispute_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_intent ON payment_disputes(payment_intent_id, opened_at DESC);

ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS provider_report_id text;
ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS report_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliation_provider_report
  ON reconciliation_runs(adapter, provider_report_id) WHERE provider_report_id IS NOT NULL;

DROP TRIGGER IF EXISTS provider_webhook_events_immutable ON provider_webhook_events;
CREATE TRIGGER provider_webhook_events_immutable BEFORE DELETE ON provider_webhook_events
FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();

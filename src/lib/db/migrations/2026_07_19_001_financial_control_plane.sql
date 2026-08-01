CREATE TABLE IF NOT EXISTS payment_intents (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(), user_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('deposit','withdrawal','refund','adjustment')),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','processing','succeeded','failed','expired','reversed','refunded','held','cancelled')),
  settlement_adapter text NOT NULL DEFAULT 'slimefish_backend', source_currency text NOT NULL, destination_currency text NOT NULL,
  gross_amount numeric(20,2) NOT NULL CHECK (gross_amount > 0), provider_fee numeric(20,2) NOT NULL DEFAULT 0 CHECK (provider_fee >= 0),
  platform_fee numeric(20,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0), net_amount numeric(20,2) NOT NULL CHECK (net_amount >= 0),
  idempotency_key text NOT NULL UNIQUE, external_reference text, ledger_transaction_id text, failure_code text, failure_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_payment_intents_user ON payment_intents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_queue ON payment_intents(status, created_at);

CREATE TABLE IF NOT EXISTS payment_events (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(), payment_intent_id char(26) NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
  event_type text NOT NULL, from_status text, to_status text NOT NULL, actor_type text NOT NULL DEFAULT 'system', actor_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_events_intent ON payment_events(payment_intent_id, occurred_at);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(), adapter text NOT NULL, status text NOT NULL DEFAULT 'running', checked_count integer NOT NULL DEFAULT 0,
  mismatch_count integer NOT NULL DEFAULT 0, details jsonb NOT NULL DEFAULT '{}'::jsonb, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS sanctions_screenings (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(), user_id text NOT NULL, status text NOT NULL DEFAULT 'pending', provider text NOT NULL DEFAULT 'manual',
  query_hash text NOT NULL, match_score integer, matched_records jsonb NOT NULL DEFAULT '[]'::jsonb, reviewed_by_user_id text, review_note text,
  screened_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sanctions_screenings_user ON sanctions_screenings(user_id, screened_at DESC);
CREATE TABLE IF NOT EXISTS report_requests (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(), user_id text NOT NULL, report_type text NOT NULL, status text NOT NULL DEFAULT 'pending', format text NOT NULL DEFAULT 'json',
  storage_url text, checksum text, expires_at timestamptz, requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_report_requests_user ON report_requests(user_id, requested_at DESC);
CREATE TABLE IF NOT EXISTS retention_policies (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(), data_class text NOT NULL UNIQUE, retention_days integer NOT NULL CHECK (retention_days > 0),
  legal_basis text NOT NULL, deletion_mode text NOT NULL DEFAULT 'anonymize', updated_by_user_id text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS request_rate_limits (
  key text PRIMARY KEY, scope text NOT NULL, count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  reset_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_rate_limits_cleanup ON request_rate_limits(reset_at);
CREATE TABLE IF NOT EXISTS resolution_proposals (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(), event_id text NOT NULL, winning_token_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','failed')),
  proposed_by_user_id text NOT NULL, evidence_url text, created_at timestamptz NOT NULL DEFAULT now(), finalized_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_resolution_proposals_pending ON resolution_proposals(event_id) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS resolution_approvals (
  id char(26) PRIMARY KEY DEFAULT generate_ulid(), proposal_id char(26) NOT NULL REFERENCES resolution_proposals(id) ON DELETE RESTRICT,
  approver_user_id text NOT NULL, decision text NOT NULL DEFAULT 'approve' CHECK (decision IN ('approve','reject')),
  note text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(proposal_id, approver_user_id)
);
INSERT INTO retention_policies(data_class, retention_days, legal_basis, deletion_mode) VALUES
 ('financial_ledger', 2555, 'Financial recordkeeping', 'retain'), ('audit_events', 2555, 'Security and regulatory audit', 'retain'),
 ('authentication_sessions', 90, 'Account security', 'delete'), ('risk_cases', 2555, 'Fraud prevention and dispute handling', 'retain'),
 ('community_content', 365, 'Service operation', 'anonymize') ON CONFLICT (data_class) DO NOTHING;

CREATE OR REPLACE FUNCTION reject_financial_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'financial history is append-only';
END $$;
DROP TRIGGER IF EXISTS payment_events_immutable ON payment_events;
CREATE TRIGGER payment_events_immutable BEFORE UPDATE OR DELETE ON payment_events FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();

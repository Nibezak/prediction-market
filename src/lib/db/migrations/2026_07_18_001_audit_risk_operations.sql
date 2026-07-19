CREATE TABLE IF NOT EXISTS audit_events (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(), event_type TEXT NOT NULL, category TEXT NOT NULL,
  action TEXT NOT NULL, outcome TEXT NOT NULL DEFAULT 'success', severity TEXT NOT NULL DEFAULT 'info',
  actor_user_id TEXT, actor_role TEXT, subject_user_id TEXT, entity_type TEXT, entity_id TEXT,
  request_id TEXT, correlation_id TEXT, idempotency_key TEXT, ip_address TEXT, user_agent TEXT,
  risk_score INTEGER, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, before_values JSONB, after_values JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_subject ON audit_events (subject_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS risk_cases (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(), user_id TEXT NOT NULL, source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', severity TEXT NOT NULL, score INTEGER NOT NULL,
  title TEXT NOT NULL, summary TEXT NOT NULL, held_amount NUMERIC(20,2), currency TEXT NOT NULL DEFAULT 'USD',
  assigned_to_user_id TEXT, disposition TEXT, resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_risk_cases_queue ON risk_cases (status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_cases_user ON risk_cases (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS risk_signals (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(), case_id CHAR(26) NOT NULL REFERENCES risk_cases(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL, rule_version INTEGER NOT NULL DEFAULT 1, category TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL, score INTEGER NOT NULL, observed_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  threshold JSONB NOT NULL DEFAULT '{}'::jsonb, evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_risk_signals_case ON risk_signals (case_id, score DESC);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(), user_id TEXT NOT NULL, amount NUMERIC(20,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD', destination TEXT, status TEXT NOT NULL DEFAULT 'requested',
  risk_case_id CHAR(26) REFERENCES risk_cases(id) ON DELETE SET NULL, idempotency_key TEXT NOT NULL,
  external_reference TEXT, ledger_transaction_id TEXT, review_note TEXT, reviewed_by_user_id TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(), held_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawal_requests_idempotency ON withdrawal_requests (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_queue ON withdrawal_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user ON withdrawal_requests (user_id, requested_at DESC);

REVOKE UPDATE, DELETE ON audit_events FROM PUBLIC;

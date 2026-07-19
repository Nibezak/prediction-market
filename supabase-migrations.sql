-- ===========================================
-- Tellwise Database Migration Script for Supabase
-- Run this in Supabase SQL Editor
-- ===========================================

-- Migration: 2025_08_28_001_extensions.sql
CREATE SCHEMA IF NOT EXISTS extensions;

DO
$$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
      CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
    END IF;
  END
$$;

DO
$$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    END IF;
  END
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;

-- Migration: 2025_08_28_002_functions.sql
CREATE OR REPLACE FUNCTION generate_ulid() RETURNS TEXT AS
$$
DECLARE
  -- Crockford's Base32
  encoding  BYTEA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  timestamp BYTEA = E'\\000\\000\\000\\000\\000\\000';
  output    TEXT  = '';
  unix_time BIGINT;
  ulid      BYTEA;
BEGIN
  -- 6 timestamp bytes
  unix_time = (EXTRACT(EPOCH FROM CLOCK_TIMESTAMP()) * 1000)::BIGINT;
  timestamp = SET_BYTE(timestamp, 0, (unix_time >> 40)::BIT(8)::INTEGER);
  timestamp = SET_BYTE(timestamp, 1, (unix_time >> 32)::BIT(8)::INTEGER);
  timestamp = SET_BYTE(timestamp, 2, (unix_time >> 24)::BIT(8)::INTEGER);
  timestamp = SET_BYTE(timestamp, 3, (unix_time >> 16)::BIT(8)::INTEGER);
  timestamp = SET_BYTE(timestamp, 4, (unix_time >> 8)::BIT(8)::INTEGER);
  timestamp = SET_BYTE(timestamp, 5, unix_time::BIT(8)::INTEGER);

  -- 10 entropy bytes
  ulid = timestamp || gen_random_bytes(10);

  -- Encode the timestamp
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 0) & 224) >> 5));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 0) & 31)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 1) & 248) >> 3));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 1) & 7) << 2) | ((GET_BYTE(ulid, 2) & 192) >> 6)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 2) & 62) >> 1));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 2) & 1) << 4) | ((GET_BYTE(ulid, 3) & 240) >> 4)));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 3) & 15) << 1) | ((GET_BYTE(ulid, 4) & 128) >> 7)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 4) & 124) >> 2));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 4) & 3) << 3) | ((GET_BYTE(ulid, 5) & 224) >> 5)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 5) & 31)));

  -- Encode the entropy
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 6) & 248) >> 3));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 6) & 7) << 2) | ((GET_BYTE(ulid, 7) & 192) >> 6)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 7) & 62) >> 1));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 7) & 1) << 4) | ((GET_BYTE(ulid, 8) & 240) >> 4)));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 8) & 15) << 1) | ((GET_BYTE(ulid, 9) & 128) >> 7)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 9) & 124) >> 2));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 9) & 3) << 3) | ((GET_BYTE(ulid, 10) & 224) >> 5)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 10) & 31)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 11) & 248) >> 3));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 11) & 7) << 2) | ((GET_BYTE(ulid, 12) & 192) >> 6)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 12) & 62) >> 1));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 12) & 1) << 4) | ((GET_BYTE(ulid, 13) & 240) >> 4)));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 13) & 15) << 1) | ((GET_BYTE(ulid, 14) & 128) >> 7)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 14) & 124) >> 2));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 14) & 3) << 3) | ((GET_BYTE(ulid, 15) & 224) >> 5)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 15) & 31)));

  RETURN output;
END
$$ LANGUAGE plpgsql VOLATILE
                    SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Migration: 2025_08_28_003_buckets.sql
DO
$$
  BEGIN
    -- Supabase storage objects are optional outside Supabase mode.
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets')
      AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('slimefish-assets',
              'slimefish-assets',
              TRUE,
              2097152,
              ARRAY ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
      ON CONFLICT (id) DO NOTHING;

      IF NOT EXISTS (SELECT 1
                     FROM pg_policies
                     WHERE policyname = 'Public read assets'
                       AND tablename = 'objects'
                       AND schemaname = 'storage') THEN
        CREATE POLICY "Public read assets" ON storage.objects
          FOR SELECT TO PUBLIC
          USING (bucket_id = 'slimefish-assets');
      END IF;

      IF NOT EXISTS (SELECT 1
                     FROM pg_policies
                     WHERE policyname = 'Service role full asset access'
                       AND tablename = 'objects'
                       AND schemaname = 'storage') THEN
        CREATE POLICY "Service role full asset access" ON storage.objects
          FOR ALL TO service_role
          USING (bucket_id = 'slimefish-assets')
          WITH CHECK (bucket_id = 'slimefish-assets');
      END IF;
    END IF;
  END
$$;

-- Migration: 2025_08_28_004_auth.sql
CREATE TABLE users
(
  id                     CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  address                TEXT        NOT NULL UNIQUE,
  username               TEXT,
  email                  TEXT        NOT NULL,
  email_verified         BOOLEAN     NOT NULL DEFAULT FALSE,
  two_factor_enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
  image                  TEXT,
  settings               JSONB       NOT NULL DEFAULT '{
    "trading": {
      "market_order_type": "FAK",
      "show_slippage_warning": false
    },
    "notifications": {
      "email_resolutions": true,
      "inapp_order_fills": true,
      "inapp_resolutions": true,
      "inapp_hide_small_fills": true
    }
  }'::jsonb,
  deposit_wallet_address   TEXT,
  deposit_wallet_signature TEXT,
  deposit_wallet_signed_at TIMESTAMPTZ,
  deposit_wallet_status    TEXT,
  deposit_wallet_tx_hash   TEXT,
  affiliate_code         TEXT,
  referred_by_user_id    CHAR(26)    REFERENCES users (id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions
(
  id         CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  expires_at TIMESTAMPTZ NOT NULL,
  token      TEXT        NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  user_id    CHAR(26)    NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE accounts
(
  id                       CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  account_id               TEXT        NOT NULL,
  provider_id              TEXT        NOT NULL,
  user_id                  CHAR(26)    NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  access_token             TEXT,
  refresh_token            TEXT,
  id_token                 TEXT,
  access_token_expires_at  TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope                    TEXT,
  password                 TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE verifications
(
  id         CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  identifier TEXT        NOT NULL,
  value      TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallets
(
  id         CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  user_id    CHAR(26)    NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  address    TEXT        NOT NULL,
  chain_id   INTEGER     NOT NULL,
  is_primary BOOLEAN     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE two_factors
(
  id           CHAR(26) NOT NULL DEFAULT generate_ulid(),
  secret       TEXT,
  backup_codes TEXT,
  verified     BOOLEAN NOT NULL DEFAULT TRUE,
  user_id      CHAR(26) NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX idx_users_email ON users (LOWER(email));
CREATE UNIQUE INDEX idx_users_username ON users (LOWER(username));
CREATE UNIQUE INDEX idx_users_address ON users (LOWER(address));
CREATE UNIQUE INDEX idx_users_deposit_wallet_address ON users (LOWER(deposit_wallet_address));
CREATE UNIQUE INDEX idx_users_affiliate_code ON users (LOWER(affiliate_code));
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_accounts_user_id ON accounts (user_id);
CREATE INDEX idx_verifications_identifier ON verifications (identifier);
CREATE INDEX idx_wallets_user_id ON wallets (user_id);
CREATE INDEX idx_two_factors_user_id ON two_factors (user_id);

ALTER TABLE users
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE two_factors
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_accounts" ON "accounts" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_sessions" ON "sessions" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_two_factors" ON "two_factors" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_users" ON "users" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_verifications" ON "verifications" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_wallets" ON "wallets" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE
  ON users
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_sessions_updated_at
  BEFORE UPDATE
  ON sessions
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_accounts_updated_at
  BEFORE UPDATE
  ON accounts
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_verifications_updated_at
  BEFORE UPDATE
  ON verifications
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 2025_08_28_005_events.sql
CREATE TABLE conditions
(
  id                           CHAR(66) PRIMARY KEY,
  oracle                       CHAR(42)    NOT NULL,
  question_id                  CHAR(66)    NOT NULL,
  resolved                     BOOLEAN              DEFAULT FALSE,
  uma_request_tx_hash          CHAR(66),
  uma_request_log_index        INTEGER,
  uma_oracle_address           CHAR(42),
  mirror_uma_request_tx_hash   CHAR(66),
  mirror_uma_request_log_index INTEGER,
  mirror_uma_oracle_address    CHAR(42),
  resolution_status            TEXT,
  resolution_flagged           BOOLEAN,
  resolution_paused            BOOLEAN,
  resolution_last_update       TIMESTAMPTZ,
  resolution_price             DECIMAL(20, 6),
  resolution_was_disputed      BOOLEAN,
  resolution_approved          BOOLEAN,
  resolution_liveness_seconds  BIGINT,
  resolution_deadline_at       TIMESTAMPTZ,
  metadata_hash                TEXT,
  creator                      CHAR(42),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tags
(
  id                   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                 TEXT        NOT NULL UNIQUE,
  slug                 TEXT        NOT NULL UNIQUE,
  is_main_category     BOOLEAN              DEFAULT FALSE,
  is_hidden            BOOLEAN     NOT NULL DEFAULT FALSE,
  hide_events          BOOLEAN     NOT NULL DEFAULT FALSE,
  display_order        SMALLINT             DEFAULT 0,
  active_markets_count INTEGER              DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events
(
  id                   CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  slug                 TEXT        NOT NULL UNIQUE,
  title                TEXT        NOT NULL,
  creator              CHAR(42),
  icon_url             TEXT,
  livestream_url       TEXT,
  show_market_icons    BOOLEAN              DEFAULT TRUE,
  enable_neg_risk      BOOLEAN              DEFAULT FALSE,
  neg_risk_augmented   BOOLEAN              DEFAULT FALSE,
  neg_risk             BOOLEAN              DEFAULT FALSE,
  neg_risk_market_id   CHAR(66),
  series_slug          TEXT,
  series_id            TEXT,
  series_recurrence    TEXT,
  status               TEXT        NOT NULL DEFAULT 'active',
  rules                TEXT,
  active_markets_count INTEGER              DEFAULT 0,
  total_markets_count  INTEGER              DEFAULT 0,
  start_date           TIMESTAMPTZ,
  end_date             TIMESTAMPTZ,
  resolved_at          TIMESTAMPTZ,
  is_hidden            BOOLEAN     NOT NULL DEFAULT FALSE,
  additional_context   TEXT,
  additional_context_updated_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('draft', 'active', 'resolved', 'archived'))
);

CREATE TABLE event_tags
(
  event_id CHAR(26) NOT NULL REFERENCES events (id) ON DELETE CASCADE ON UPDATE CASCADE,
  tag_id   SMALLINT NOT NULL REFERENCES tags (id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (event_id, tag_id)
);

CREATE TABLE markets
(
  condition_id          TEXT PRIMARY KEY REFERENCES conditions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  event_id              CHAR(26)    NOT NULL REFERENCES events (id) ON DELETE CASCADE ON UPDATE CASCADE,
  title                 TEXT        NOT NULL,
  slug                  TEXT        NOT NULL,
  short_title           TEXT,
  question              TEXT,
  market_rules          TEXT,
  resolution_source     TEXT,
  resolution_source_url TEXT,
  resolver              CHAR(42),
  neg_risk              BOOLEAN              DEFAULT FALSE NOT NULL,
  neg_risk_other        BOOLEAN              DEFAULT FALSE NOT NULL,
  neg_risk_market_id    CHAR(66),
  neg_risk_request_id   CHAR(66),
  metadata_version      TEXT,
  metadata_schema       TEXT,
  icon_url              TEXT,
  is_active             BOOLEAN              DEFAULT TRUE,
  is_resolved           BOOLEAN              DEFAULT FALSE,
  metadata              JSONB,
  volume_24h            DECIMAL(20, 6)       DEFAULT 0,
  volume                DECIMAL(20, 6)       DEFAULT 0,
  end_time              TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, slug),
  CHECK (volume_24h >= 0),
  CHECK (volume >= 0)
);

CREATE TABLE outcomes
(
  token_id           TEXT PRIMARY KEY,
  condition_id       CHAR(66)    NOT NULL REFERENCES conditions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  outcome_text       TEXT        NOT NULL,
  outcome_index      SMALLINT    NOT NULL,
  is_winning_outcome BOOLEAN              DEFAULT FALSE,
  payout_value       DECIMAL(20, 6),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (condition_id, outcome_index),
  CHECK (outcome_index >= 0),
  CHECK (payout_value IS NULL OR payout_value >= 0)
);

CREATE TABLE subgraph_syncs
(
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_name    text        NOT NULL,
  subgraph_name   text        NOT NULL,
  status          text                 DEFAULT 'idle',
  cursor_updated_at BIGINT,
  cursor_id       TEXT,
  total_processed INTEGER              DEFAULT 0,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service_name, subgraph_name),
  CHECK (status IN ('idle', 'running', 'completed', 'error')),
  CHECK (total_processed >= 0)
);

CREATE INDEX idx_events_end_date ON events (end_date);
CREATE INDEX idx_events_title_lower_gin_trgm ON events USING GIN (LOWER(title) gin_trgm_ops);
CREATE INDEX idx_conditions_question_id ON conditions (question_id);
CREATE INDEX idx_markets_neg_risk_request_id ON markets (neg_risk_request_id) WHERE neg_risk_request_id IS NOT NULL;
CREATE INDEX idx_markets_event_id_active_resolved ON markets (event_id, is_active, is_resolved);
CREATE INDEX idx_markets_active_resolved_updated_at ON markets (is_active, is_resolved, updated_at);
CREATE INDEX idx_event_tags_tag_id_event_id ON event_tags (tag_id, event_id);
CREATE INDEX idx_markets_event_id_condition_id ON markets (event_id, condition_id);
CREATE INDEX idx_conditions_updated_at_id ON conditions (updated_at DESC, id DESC);
CREATE INDEX idx_events_status_active_markets_count ON events (status, active_markets_count);

ALTER TABLE conditions
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE events
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tags
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcomes
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subgraph_syncs
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_conditions" ON "conditions" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_tags" ON "tags" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_events" ON "events" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_event_tags" ON "event_tags" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_markets" ON "markets" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_outcomes" ON "outcomes" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_subgraph_syncs" ON "subgraph_syncs" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);

CREATE TRIGGER set_conditions_updated_at
  BEFORE UPDATE
  ON conditions
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE
  ON events
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_markets_updated_at
  BEFORE UPDATE
  ON markets
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_outcomes_updated_at
  BEFORE UPDATE
  ON outcomes
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_tags_updated_at
  BEFORE UPDATE
  ON tags
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_subgraph_syncs_updated_at
  BEFORE UPDATE
  ON subgraph_syncs
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION update_event_markets_count()
  RETURNS TRIGGER
  SET search_path = 'public'
AS
$$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE events
    SET active_markets_count = (SELECT COUNT(*)
                                FROM markets
                                WHERE event_id = NEW.event_id
                                  AND is_active = TRUE
                                  AND is_resolved = FALSE),
        total_markets_count  = (SELECT COUNT(*)
                                FROM markets
                                WHERE event_id = NEW.event_id)
    WHERE id = NEW.event_id;
  END IF;

  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.event_id != NEW.event_id) THEN
    UPDATE events
    SET active_markets_count = (SELECT COUNT(*)
                                FROM markets
                                WHERE event_id = OLD.event_id
                                  AND is_active = TRUE
                                  AND is_resolved = FALSE),
        total_markets_count  = (SELECT COUNT(*)
                                FROM markets
                                WHERE event_id = OLD.event_id)
    WHERE id = OLD.event_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE 'plpgsql';

CREATE OR REPLACE FUNCTION update_tag_markets_count()
  RETURNS TRIGGER
  SET search_path = 'public'
AS
$$
DECLARE
  affected_event_id CHAR(26);
BEGIN
  affected_event_id := COALESCE(NEW.event_id, OLD.event_id);

  UPDATE tags
  SET active_markets_count = (SELECT COUNT(DISTINCT m.condition_id)
                              FROM markets m
                                     JOIN event_tags et ON m.event_id = et.event_id
                              WHERE et.tag_id = tags.id
                                AND m.is_active = TRUE
                                AND m.is_resolved = FALSE)
  WHERE id IN (SELECT DISTINCT et.tag_id
               FROM event_tags et
               WHERE et.event_id = affected_event_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER trigger_update_event_markets_count
  AFTER INSERT OR UPDATE OR DELETE
  ON markets
  FOR EACH ROW
EXECUTE FUNCTION update_event_markets_count();

CREATE TRIGGER trigger_update_tag_markets_count
  AFTER INSERT OR UPDATE OR DELETE
  ON markets
  FOR EACH ROW
EXECUTE FUNCTION update_tag_markets_count();

CREATE TRIGGER trigger_update_tag_markets_count_event_tags
  AFTER INSERT OR UPDATE OR DELETE
  ON event_tags
  FOR EACH ROW
EXECUTE FUNCTION update_tag_markets_count();

CREATE OR REPLACE VIEW v_main_tag_subcategories
  WITH (security_invoker = true) AS
SELECT main_tag.id                    AS main_tag_id,
       main_tag.slug                  AS main_tag_slug,
       main_tag.name                  AS main_tag_name,
       main_tag.is_hidden             AS main_tag_is_hidden,
       sub_tag.id                     AS sub_tag_id,
       sub_tag.name                   AS sub_tag_name,
       sub_tag.slug                   AS sub_tag_slug,
       sub_tag.is_main_category       AS sub_tag_is_main_category,
       sub_tag.is_hidden              AS sub_tag_is_hidden,
       COUNT(DISTINCT m.condition_id) AS active_markets_count,
       MAX(m.updated_at)              AS last_market_activity_at
FROM tags AS main_tag
       JOIN event_tags AS et_main
            ON et_main.tag_id = main_tag.id
       JOIN markets AS m
            ON m.event_id = et_main.event_id
       JOIN event_tags AS et_sub
            ON et_sub.event_id = et_main.event_id
       JOIN tags AS sub_tag
            ON sub_tag.id = et_sub.tag_id
WHERE main_tag.is_main_category = TRUE
  AND main_tag.is_hidden = FALSE
  AND m.is_active = TRUE
  AND m.is_resolved = FALSE
  AND sub_tag.id <> main_tag.id
  AND sub_tag.is_main_category = FALSE
  AND sub_tag.is_hidden = FALSE
GROUP BY main_tag.id,
         main_tag.slug,
         main_tag.name,
         main_tag.is_hidden,
         sub_tag.id,
         sub_tag.name,
         sub_tag.slug,
         sub_tag.is_main_category,
         sub_tag.is_hidden;

WITH desired(name, slug, display_order) AS (
  VALUES
    ('Politics', 'politics', 1),
    ('Sports', 'sports', 2),
    ('Crypto', 'crypto', 3),
    ('Esports', 'esports', 4),
    ('Finance', 'finance', 5),
    ('Geopolitics', 'geopolitics', 6),
    ('Tech', 'tech', 7),
    ('Culture', 'culture', 8),
    ('World', 'world', 9),
    ('Economy', 'economy', 10),
    ('Weather', 'weather', 11),
    ('Elections', 'elections', 12),
    ('Mentions', 'mentions', 13)
),
upserted AS (
  INSERT INTO tags (name, slug, is_main_category, display_order, is_hidden, hide_events)
  SELECT name, slug, TRUE, display_order, FALSE, FALSE
  FROM desired
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    is_main_category = TRUE,
    is_hidden = FALSE,
    hide_events = FALSE
  RETURNING slug
)
UPDATE tags
SET is_main_category = FALSE
WHERE is_main_category = TRUE
  AND slug NOT IN (SELECT slug FROM upserted);

UPDATE tags
SET hide_events = TRUE
WHERE slug IN ('crypto-prices', 'recurring', 'today-', 'today', '4h', 'daily');

-- Migration: 2025_08_28_007_bookmarks.sql
CREATE TABLE bookmarks
(
  user_id  CHAR(26) NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  event_id CHAR(26) NOT NULL REFERENCES events (id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (user_id, event_id)
);

ALTER TABLE bookmarks
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_bookmarks" ON "bookmarks" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);

-- Migration: 2025_09_01_001_orders.sql
CREATE TABLE orders
(
  id                   CHAR(26) PRIMARY KEY     DEFAULT generate_ulid() NOT NULL,
  -- begin blockchain data
  salt                 NUMERIC(78, 0),
  maker                TEXT                                             NOT NULL,
  signer               TEXT                                             NOT NULL,
  taker                TEXT                                             NOT NULL,
  token_id             TEXT                                             NOT NULL,
  maker_amount         BIGINT                                           NOT NULL,
  taker_amount         BIGINT                                           NOT NULL,
  expiration           BIGINT                                           NOT NULL,
  nonce                BIGINT                                           NOT NULL,
  fee_rate_bps         SMALLINT                                         NOT NULL,
  side                 SMALLINT                                         NOT NULL,
  signature_type       SMALLINT                                         NOT NULL,
  signature            TEXT,
  -- end blockchain data
  user_id              TEXT                                             NOT NULL,
  condition_id         TEXT                                             NOT NULL,
  type                 TEXT                                             NOT NULL,
  affiliate_user_id    TEXT,
  clob_order_id        TEXT                                             NOT NULL,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()           NOT NULL,
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()           NOT NULL,
  CONSTRAINT orders_type_check CHECK (orders.type IN ('FAK', 'FOK', 'GTC', 'GTD')),
  CONSTRAINT orders_side_check CHECK (orders.side IN (0, 1))
);

CREATE INDEX idx_orders_user_id ON orders (user_id);
CREATE INDEX idx_orders_condition ON orders (condition_id, token_id);
CREATE INDEX idx_orders_created_at ON orders (created_at);

ALTER TABLE orders
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_orders ON orders AS PERMISSIVE FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE TRIGGER set_orders_updated_at
  BEFORE
    UPDATE
  ON orders
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 2025_09_24_001_affiliates.sql
CREATE TABLE affiliate_referrals
(
  id                CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  user_id           CHAR(26)    NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  affiliate_user_id CHAR(26)    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE affiliate_referrals
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_affiliate_referrals" ON "affiliate_referrals" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION get_affiliate_stats(target_user_id CHAR(26))
  RETURNS TABLE
          (
            total_referrals  BIGINT,
            active_referrals BIGINT,
            volume           NUMERIC
          )
  LANGUAGE SQL
  STABLE
  SET search_path = public
AS
$$
SELECT COALESCE((SELECT COUNT(*) FROM affiliate_referrals ar WHERE ar.affiliate_user_id = target_user_id),
                0)                                               AS total_referrals,
       COALESCE((SELECT COUNT(DISTINCT o.user_id)
                 FROM orders o
                 WHERE o.affiliate_user_id = target_user_id), 0) AS active_referrals,
       COALESCE((SELECT SUM(o.maker_amount)
                 FROM orders o
                 WHERE o.affiliate_user_id = target_user_id), 0) AS volume;
$$;

CREATE OR REPLACE FUNCTION get_affiliate_overview()
  RETURNS TABLE
          (
            affiliate_user_id CHAR(26),
            total_referrals   BIGINT,
            volume            NUMERIC
          )
  LANGUAGE SQL
  STABLE
  SET search_path = public
AS
$$
SELECT u.id                            AS affiliate_user_id,
       COALESCE(ar.count_referrals, 0) AS total_referrals,
       COALESCE(ord.volume, 0)         AS volume
FROM users u
       LEFT JOIN (SELECT affiliate_user_id, COUNT(*) AS count_referrals
                  FROM affiliate_referrals
                  GROUP BY affiliate_user_id) ar ON ar.affiliate_user_id = u.id
       LEFT JOIN (SELECT affiliate_user_id,
                         SUM(maker_amount) AS volume
                  FROM orders
                  WHERE affiliate_user_id IS NOT NULL
                  GROUP BY affiliate_user_id) ord ON ord.affiliate_user_id = u.id
WHERE ar.count_referrals IS NOT NULL
   OR ord.volume IS NOT NULL
ORDER BY COALESCE(ord.volume, 0) DESC
LIMIT 100;
$$;

-- Migration: 2025_09_24_001_notifications.sql
CREATE TABLE notifications
(
  id          CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  user_id     CHAR(26)    NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  category    TEXT        NOT NULL CHECK (category IN ('trade', 'system', 'general')),
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL,
  extra_info  TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}'::JSONB,
  link_type   TEXT        NOT NULL DEFAULT 'none'
    CHECK (link_type IN ('none', 'market', 'event', 'order', 'settings', 'profile', 'external', 'custom')),
  link_target TEXT,
  link_url    TEXT,
  link_label  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (link_url IS NULL OR CHAR_LENGTH(link_url) <= 2048),
  CHECK (link_type <> 'external' OR link_url IS NOT NULL),
  CHECK (
    link_type NOT IN ('market', 'event', 'order', 'settings', 'profile')
      OR link_target IS NOT NULL
    )
);

CREATE INDEX idx_notifications_user_id ON notifications (user_id);
CREATE INDEX idx_notifications_category ON notifications (category);
CREATE INDEX idx_notifications_user_created_at ON notifications (user_id, created_at DESC);

ALTER TABLE notifications
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_notifications" ON "notifications" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);

-- Migration: 2025_10_01_001_settings_table.sql
CREATE TABLE settings
(
  id         SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "group"    TEXT        NOT NULL,
  key        TEXT        NOT NULL,
  value      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("group", key)
);

ALTER TABLE settings
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_settings" ON "settings" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);

CREATE TRIGGER set_settings_updated_at
  BEFORE UPDATE
  ON settings
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO settings ("group", key, value)
VALUES ('affiliate', 'builder_taker_fee_bps', '100'),
       ('affiliate', 'builder_maker_fee_bps', '0'),
       ('affiliate', 'affiliate_share_bps', '5000')
ON CONFLICT ("group", key) DO NOTHING;

INSERT INTO settings ("group", key, value)
VALUES ('ai', 'openrouter_api_key', ''),
       ('ai', 'openrouter_model', ''),
       ('ai', 'openrouter_enabled', 'false')
ON CONFLICT ("group", key) DO NOTHING;

INSERT INTO settings ("group", key, value)
VALUES ('i18n', 'enabled_locales', '["en","de","es","pt","fr","zh", "ja", "ar", "ru", "it", "pl"]')
ON CONFLICT ("group", key) DO NOTHING;

-- Migration: 2026_01_30_001_conditions_audit.sql
CREATE TABLE conditions_audit
(
  id           CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  condition_id CHAR(66)    NOT NULL REFERENCES conditions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  old_values   JSONB       NOT NULL,
  new_values   JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conditions_audit_condition_id_created_at
  ON conditions_audit (condition_id, created_at DESC);

ALTER TABLE conditions_audit
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_conditions_audit" ON "conditions_audit" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION log_conditions_update()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  old_row  JSONB;
  new_row  JSONB;
  diff_old JSONB;
  diff_new JSONB;
BEGIN
  old_row := to_jsonb(OLD) - 'updated_at';
  new_row := to_jsonb(NEW) - 'updated_at';

  SELECT
    jsonb_object_agg(key, old_value),
    jsonb_object_agg(key, new_value)
  INTO diff_old, diff_new
  FROM (
    SELECT key, value AS old_value, new_row -> key AS new_value
    FROM jsonb_each(old_row)
    WHERE value IS DISTINCT FROM new_row -> key
      AND NOT (
        value = 'null'::jsonb
        AND new_row -> key IS DISTINCT FROM 'null'::jsonb
      )
  ) changes;

  IF diff_new IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO conditions_audit (condition_id, old_values, new_values)
  VALUES (OLD.id, diff_old, diff_new);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_conditions_update
  AFTER UPDATE
  ON conditions
  FOR EACH ROW
EXECUTE FUNCTION log_conditions_update();

-- Migration: 2026_02_06_001_tag_translations.sql
CREATE TABLE tag_translations
(
  tag_id     SMALLINT    NOT NULL REFERENCES tags (id) ON DELETE CASCADE ON UPDATE CASCADE,
  locale     TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  source_hash TEXT,
  is_manual  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tag_id, locale),
  CHECK (locale <> 'en')
);

CREATE INDEX idx_tag_translations_locale ON tag_translations (locale);

ALTER TABLE tag_translations
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_tag_translations" ON "tag_translations" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);

CREATE TRIGGER set_tag_translations_updated_at
  BEFORE UPDATE
  ON tag_translations
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

WITH defaults(slug, locale, name) AS (
  VALUES
    ('weather', 'de', 'Wetter'),
    ('weather', 'es', 'Clima'),
    ('weather', 'pt', 'Tempo'),
    ('weather', 'fr', 'Météo'),
    ('weather', 'zh', '天气'),
    ('crypto', 'de', 'Krypto'),
    ('crypto', 'es', 'Cripto'),
    ('crypto', 'pt', 'Cripto'),
    ('crypto', 'fr', 'Crypto'),
    ('crypto', 'zh', '加密货币'),
    ('culture', 'de', 'Kultur'),
    ('culture', 'es', 'Cultura'),
    ('culture', 'pt', 'Cultura'),
    ('culture', 'fr', 'Culture'),
    ('culture', 'zh', '文化'),
    ('economy', 'de', 'Wirtschaft'),
    ('economy', 'es', 'Economía'),
    ('economy', 'pt', 'Economia'),
    ('economy', 'fr', 'Économie'),
    ('economy', 'zh', '经济'),
    ('elections', 'de', 'Wahlen'),
    ('elections', 'es', 'Elecciones'),
    ('elections', 'pt', 'Eleições'),
    ('elections', 'fr', 'Élections'),
    ('elections', 'zh', '选举'),
    ('finance', 'de', 'Finanzen'),
    ('finance', 'es', 'Finanzas'),
    ('finance', 'pt', 'Finanças'),
    ('finance', 'fr', 'Finance'),
    ('finance', 'zh', '金融'),
    ('geopolitics', 'de', 'Geopolitik'),
    ('geopolitics', 'es', 'Geopolítica'),
    ('geopolitics', 'pt', 'Geopolítica'),
    ('geopolitics', 'fr', 'Géopolitique'),
    ('geopolitics', 'zh', '地缘政治'),
    ('mentions', 'de', 'Erwähnungen'),
    ('mentions', 'es', 'Menciones'),
    ('mentions', 'pt', 'Menções'),
    ('mentions', 'fr', 'Mentions'),
    ('mentions', 'zh', '提及'),
    ('politics', 'de', 'Politik'),
    ('politics', 'es', 'Política'),
    ('politics', 'pt', 'Política'),
    ('politics', 'fr', 'Politique'),
    ('politics', 'zh', '政治'),
    ('sports', 'de', 'Sport'),
    ('sports', 'es', 'Deportes'),
    ('sports', 'pt', 'Esportes'),
    ('sports', 'fr', 'Sports'),
    ('sports', 'zh', '体育'),
    ('tech', 'de', 'Technologie'),
    ('tech', 'es', 'Tecnología'),
    ('tech', 'pt', 'Tecnologia'),
    ('tech', 'fr', 'Technologie'),
    ('tech', 'zh', '科技'),
    ('world', 'de', 'Welt'),
    ('world', 'es', 'Mundo'),
    ('world', 'pt', 'Mundo'),
    ('world', 'fr', 'Monde'),
    ('world', 'zh', '世界')
)
INSERT INTO tag_translations (tag_id, locale, name, source_hash, is_manual)
SELECT t.id, d.locale, d.name, NULL, TRUE
FROM defaults d
INNER JOIN tags t ON t.slug = d.slug
ON CONFLICT (tag_id, locale) DO NOTHING;

-- Migration: 2026_02_09_001_event_title_translations.sql
CREATE TABLE event_translations
(
  event_id     CHAR(26)    NOT NULL REFERENCES events (id) ON DELETE CASCADE ON UPDATE CASCADE,
  locale       TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  source_hash  TEXT        NOT NULL,
  is_manual    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, locale),
  CHECK (locale <> 'en')
);

CREATE INDEX idx_event_translations_locale ON event_translations (locale);

ALTER TABLE event_translations
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_event_translations" ON "event_translations" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);

CREATE TRIGGER set_event_translations_updated_at
  BEFORE UPDATE
  ON event_translations
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 2026_02_10_001_jobs.sql
CREATE TABLE jobs
(
  id          CHAR(26)     PRIMARY KEY DEFAULT generate_ulid(),
  job_type    TEXT        NOT NULL,
  dedupe_key  TEXT        NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status      TEXT        NOT NULL DEFAULT 'pending',
  attempts    SMALLINT    NOT NULL DEFAULT 0,
  max_attempts SMALLINT   NOT NULL DEFAULT 5,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reserved_at TIMESTAMPTZ,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CHECK (attempts >= 0),
  CHECK (max_attempts > 0),
  UNIQUE (job_type, dedupe_key)
);

CREATE INDEX idx_jobs_status_available_at ON jobs (status, available_at);
CREATE INDEX idx_jobs_job_type_status_available_at ON jobs (job_type, status, available_at);
CREATE INDEX idx_jobs_status_updated_at ON jobs (status, updated_at);
CREATE INDEX idx_jobs_status_reserved_at ON jobs (status, reserved_at);

ALTER TABLE jobs
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_jobs" ON "jobs" AS PERMISSIVE FOR ALL TO "service_role" USING (TRUE) WITH CHECK (TRUE);

CREATE TRIGGER set_jobs_updated_at
  BEFORE UPDATE
  ON jobs
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 2026_02_13_001_event_live_chart_configs.sql
CREATE TABLE event_live_chart_configs
(
  series_slug            TEXT PRIMARY KEY,
  topic                  TEXT        NOT NULL DEFAULT 'crypto_prices_chainlink',
  event_type             TEXT        NOT NULL DEFAULT 'update',
  symbol                 TEXT        NOT NULL,
  display_name           TEXT        NOT NULL,
  display_symbol         TEXT        NOT NULL,
  line_color             TEXT        NOT NULL DEFAULT '#F59E0B',
  icon_path              TEXT,
  enabled                BOOLEAN     NOT NULL DEFAULT TRUE,
  show_price_decimals    BOOLEAN     NOT NULL DEFAULT TRUE,
  active_window_minutes  INTEGER     NOT NULL DEFAULT 1440,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_live_chart_configs_active_window_minutes_positive CHECK (active_window_minutes > 0)
);

ALTER TABLE event_live_chart_configs
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_event_live_chart_configs"
  ON "event_live_chart_configs"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE TRIGGER set_event_live_chart_configs_updated_at
  BEFORE UPDATE
  ON event_live_chart_configs
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO event_live_chart_configs (
  series_slug,
  topic,
  event_type,
  symbol,
  display_name,
  display_symbol,
  line_color,
  icon_path,
  enabled
)
VALUES (
  'meta-daily-up-down',
  'equity_prices',
  'update',
  'META',
  'Meta',
  'META',
  '#0866FF',
  '/images/live-assets/meta.svg',
  TRUE
);

COMMENT ON COLUMN event_live_chart_configs.show_price_decimals IS
  'When true, render live chart prices with cents/decimals.';

COMMENT ON COLUMN event_live_chart_configs.active_window_minutes IS
  'How many minutes before event end the market is considered actively trading.';

-- Migration: 2026_02_13_002_fix_meta_live_chart_config.sql
INSERT INTO event_live_chart_configs (
  series_slug,
  topic,
  event_type,
  symbol,
  display_name,
  display_symbol,
  line_color,
  icon_path,
  enabled
)
VALUES
  (
    'aapl-daily-up-down',
    'equity_prices',
    'update',
    'AAPL',
    'Apple',
    'AAPL',
    '#555555',
    '/images/live-assets/aapl.svg',
    TRUE
  ),
  (
    'bitcoin-up-or-down-4h',
    'crypto_prices_chainlink',
    'update',
    'btc/usd',
    'Bitcoin',
    'BTC/USD',
    '#FF9900',
    '/images/live-assets/btc.svg',
    TRUE
  ),
  (
    'btc-up-or-down-15m',
    'crypto_prices_chainlink',
    'update',
    'btc/usd',
    'Bitcoin',
    'BTC/USD',
    '#FF9900',
    '/images/live-assets/btc.svg',
    TRUE
  ),
  (
    'btc-up-or-down-5m',
    'crypto_prices_chainlink',
    'update',
    'btc/usd',
    'Bitcoin',
    'BTC/USD',
    '#FF9900',
    '/images/live-assets/btc.svg',
    TRUE
  ),
  (
    'btc-up-or-down-daily',
    'crypto_prices_chainlink',
    'update',
    'btc/usd',
    'Bitcoin',
    'BTC/USD',
    '#FF9900',
    '/images/live-assets/btc.svg',
    TRUE
  ),
  (
    'btc-up-or-down-hourly',
    'crypto_prices_chainlink',
    'update',
    'btc/usd',
    'Bitcoin',
    'BTC/USD',
    '#FF9900',
    '/images/live-assets/btc.svg',
    TRUE
  ),
  (
    'eth-up-or-down-15m',
    'crypto_prices_chainlink',
    'update',
    'eth/usd',
    'Ethereum',
    'ETH/USD',
    '#637FEB',
    '/images/live-assets/eth.svg',
    TRUE
  ),
  (
    'eth-up-or-down-4h',
    'crypto_prices_chainlink',
    'update',
    'eth/usd',
    'Ethereum',
    'ETH/USD',
    '#637FEB',
    '/images/live-assets/eth.svg',
    TRUE
  ),
  (
    'eth-up-or-down-daily',
    'crypto_prices_chainlink',
    'update',
    'eth/usd',
    'Ethereum',
    'ETH/USD',
    '#637FEB',
    '/images/live-assets/eth.svg',
    TRUE
  ),
  (
    'eth-up-or-down-hourly',
    'crypto_prices_chainlink',
    'update',
    'eth/usd',
    'Ethereum',
    'ETH/USD',
    '#637FEB',
    '/images/live-assets/eth.svg',
    TRUE
  ),
  (
    'ethereum-up-or-down-4h',
    'crypto_prices_chainlink',
    'update',
    'eth/usd',
    'Ethereum',
    'ETH/USD',
    '#637FEB',
    '/images/live-assets/eth.svg',
    TRUE
  ),
  (
    'googl-daily-up-down',
    'equity_prices',
    'update',
    'GOOGL',
    'Google',
    'GOOGL',
    '#4285F4',
    '/images/live-assets/googl.svg',
    TRUE
  ),
  (
    'meta-daily-up-down',
    'equity_prices',
    'update',
    'META',
    'Meta',
    'META',
    '#0866FF',
    '/images/live-assets/meta.svg',
    TRUE
  ),
  (
    'msft-daily-up-down',
    'equity_prices',
    'update',
    'MSFT',
    'Microsoft',
    'MSFT',
    '#0078D4',
    '/images/live-assets/msft.svg',
    TRUE
  ),
  (
    'sol-up-or-down-15m',
    'crypto_prices_chainlink',
    'update',
    'sol/usd',
    'Solana',
    'SOL/USD',
    '#9945FF',
    '/images/live-assets/sol.svg',
    TRUE
  ),
  (
    'sol-up-or-down-4h',
    'crypto_prices_chainlink',
    'update',
    'sol/usd',
    'Solana',
    'SOL/USD',
    '#9945FF',
    '/images/live-assets/sol.svg',
    TRUE
  ),
  (
    'solana-up-or-down-4h',
    'crypto_prices_chainlink',
    'update',
    'sol/usd',
    'Solana',
    'SOL/USD',
    '#9945FF',
    '/images/live-assets/sol.svg',
    TRUE
  ),
  (
    'solana-up-or-down-daily',
    'crypto_prices_chainlink',
    'update',
    'sol/usd',
    'Solana',
    'SOL/USD',
    '#9945FF',
    '/images/live-assets/sol.svg',
    TRUE
  ),
  (
    'solana-up-or-down-hourly',
    'crypto_prices_chainlink',
    'update',
    'sol/usd',
    'Solana',
    'SOL/USD',
    '#9945FF',
    '/images/live-assets/sol.svg',
    TRUE
  ),
  (
    'tsla-daily-up-down',
    'equity_prices',
    'update',
    'TSLA',
    'Tesla',
    'TSLA',
    '#CC0000',
    '/images/live-assets/tsla.svg',
    TRUE
  ),
  (
    'xrp-up-or-down-15m',
    'crypto_prices_chainlink',
    'update',
    'xrp/usd',
    'XRP',
    'XRP/USD',
    '#028CFF',
    '/images/live-assets/xrp.svg',
    TRUE
  ),
  (
    'xrp-up-or-down-4h',
    'crypto_prices_chainlink',
    'update',
    'xrp/usd',
    'XRP',
    'XRP/USD',
    '#028CFF',
    '/images/live-assets/xrp.svg',
    TRUE
  ),
  (
    'xrp-up-or-down-daily',
    'crypto_prices_chainlink',
    'update',
    'xrp/usd',
    'XRP',
    'XRP/USD',
    '#028CFF',
    '/images/live-assets/xrp.svg',
    TRUE
  ),
  (
    'xrp-up-or-down-hourly',
    'crypto_prices_chainlink',
    'update',
    'xrp/usd',
    'XRP',
    'XRP/USD',
    '#028CFF',
    '/images/live-assets/xrp.svg',
    TRUE
  )
ON CONFLICT (series_slug) DO UPDATE
SET
  topic = EXCLUDED.topic,
  event_type = EXCLUDED.event_type,
  symbol = EXCLUDED.symbol,
  display_name = EXCLUDED.display_name,
  display_symbol = EXCLUDED.display_symbol,
  line_color = EXCLUDED.line_color,
  icon_path = EXCLUDED.icon_path,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

UPDATE event_live_chart_configs
SET show_price_decimals = CASE
  WHEN topic = 'equity_prices' THEN TRUE
  WHEN topic = 'crypto_prices_chainlink' THEN FALSE
  ELSE show_price_decimals
END;

UPDATE event_live_chart_configs
SET active_window_minutes = CASE
  WHEN series_slug ILIKE '%15m%' THEN 15
  WHEN series_slug ILIKE '%5m%' THEN 5
  WHEN series_slug ILIKE '%hourly%' THEN 60
  WHEN series_slug ILIKE '%4h%' THEN 240
  WHEN series_slug ILIKE '%daily%' AND topic = 'equity_prices' THEN 390
  WHEN series_slug ILIKE '%daily%' THEN 1440
  ELSE active_window_minutes
END;

-- Migration: 2026_02_22_001_event_start_date.sql
CREATE TABLE IF NOT EXISTS series_social_trackers
(
  id                     SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  series_slug            TEXT        NOT NULL,
  platform               TEXT        NOT NULL DEFAULT 'X',
  handle                 TEXT        NOT NULL,
  display_name           TEXT        NOT NULL,
  is_verified            BOOLEAN     NOT NULL DEFAULT FALSE,
  bio                    TEXT,
  is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
  priority               SMALLINT    NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT series_social_trackers_platform_check CHECK (platform IN ('X', 'TRUTH_SOCIAL')),
  CONSTRAINT series_social_trackers_priority_check CHECK (priority >= 0),
  CONSTRAINT series_social_trackers_series_slug_platform_handle_key UNIQUE (series_slug, platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_series_social_trackers_series_slug
  ON series_social_trackers (series_slug);

CREATE INDEX IF NOT EXISTS idx_series_social_trackers_series_slug_active
  ON series_social_trackers (series_slug, is_active);

ALTER TABLE series_social_trackers
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_series_social_trackers" ON "series_social_trackers";
CREATE POLICY "service_role_all_series_social_trackers"
  ON "series_social_trackers"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (TRUE)
  WITH CHECK (TRUE);

DROP TRIGGER IF EXISTS set_series_social_trackers_updated_at ON series_social_trackers;
CREATE TRIGGER set_series_social_trackers_updated_at
  BEFORE UPDATE
  ON series_social_trackers
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO series_social_trackers (
  series_slug,
  platform,
  handle,
  display_name,
  is_verified,
  bio,
  is_active,
  priority
)
VALUES
  (
    'elon-tweets',
    'X',
    'elonmusk',
    'Elon Musk',
    FALSE,
    NULL,
    TRUE,
    10
  ),
  (
    'elon-tweet-daily',
    'X',
    'elonmusk',
    'Elon Musk',
    FALSE,
    NULL,
    TRUE,
    10
  ),
  (
    'elon-tweets-48h',
    'X',
    'elonmusk',
    'Elon Musk',
    FALSE,
    NULL,
    TRUE,
    10
  ),
  (
    'trump-truth-social',
    'TRUTH_SOCIAL',
    'realDonaldTrump',
    'Donald J. Trump',
    TRUE,
    'p/p',
    TRUE,
    10
  ),
  (
    'andrew-tate-tweets',
    'X',
    'Cobratate',
    'Andrew Tate',
    FALSE,
    'Unmatched perspicacity coupled with sheer indefatigability makes me a feared opponent in any realm of human endeavour. Escape Slavery: https://t.co/b2DF1rm9ij',
    TRUE,
    10
  )
ON CONFLICT (series_slug, platform, handle)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_verified = EXCLUDED.is_verified,
  bio = EXCLUDED.bio,
  is_active = EXCLUDED.is_active,
  priority = EXCLUDED.priority,
  updated_at = NOW();

-- Migration: 2026_02_23_001_sports_metadata_fields.sql
CREATE TABLE IF NOT EXISTS event_sports (
  event_id CHAR(26) PRIMARY KEY
    REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  sports_event_id TEXT,
  sports_event_slug TEXT,
  sports_parent_event_id BIGINT,
  sports_game_id BIGINT,
  sports_event_date DATE,
  sports_start_time TIMESTAMPTZ,
  sports_series_slug TEXT,
  sports_series_id TEXT,
  sports_series_recurrence TEXT,
  sports_series_color TEXT,
  sports_sport_slug TEXT,
  sports_event_week INTEGER,
  sports_league_label TEXT,
  sports_league_slug TEXT,
  sports_score TEXT,
  sports_period TEXT,
  sports_elapsed TEXT,
  sports_live BOOLEAN,
  sports_ended BOOLEAN,
  sports_tags JSONB,
  sports_teams JSONB,
  sports_team_logo_urls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_sports_event_id
  ON event_sports (sports_event_id);

CREATE INDEX IF NOT EXISTS idx_event_sports_parent_event_id
  ON event_sports (sports_parent_event_id);

CREATE INDEX IF NOT EXISTS idx_event_sports_game_id
  ON event_sports (sports_game_id);

CREATE INDEX IF NOT EXISTS idx_event_sports_event_slug
  ON event_sports (sports_event_slug);

CREATE INDEX IF NOT EXISTS idx_event_sports_series_slug
  ON event_sports (sports_series_slug);

CREATE INDEX IF NOT EXISTS idx_event_sports_series_id
  ON event_sports (sports_series_id);

CREATE INDEX IF NOT EXISTS idx_event_sports_sport_slug
  ON event_sports (sports_sport_slug);

CREATE INDEX IF NOT EXISTS idx_event_sports_teams_gin
  ON event_sports
  USING GIN (sports_teams);

CREATE INDEX IF NOT EXISTS idx_event_sports_league_slug
  ON event_sports (sports_league_slug);

CREATE INDEX IF NOT EXISTS idx_event_sports_event_slug_league_slug
  ON event_sports (sports_event_slug, sports_league_slug);

CREATE TABLE IF NOT EXISTS market_sports (
  condition_id TEXT PRIMARY KEY
    REFERENCES markets (condition_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  event_id CHAR(26)
    REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  sports_market_type TEXT,
  sports_line NUMERIC(20, 8),
  sports_group_item_title TEXT,
  sports_group_item_threshold TEXT,
  sports_game_start_time TIMESTAMPTZ,
  sports_event_id BIGINT,
  sports_parent_event_id BIGINT,
  sports_game_id BIGINT,
  sports_event_date DATE,
  sports_start_time TIMESTAMPTZ,
  sports_series_color TEXT,
  sports_event_slug TEXT,
  sports_teams JSONB,
  sports_team_logo_urls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_sports_market_type
  ON market_sports (sports_market_type);

CREATE INDEX IF NOT EXISTS idx_market_sports_event_id
  ON market_sports (sports_event_id);

CREATE INDEX IF NOT EXISTS idx_market_sports_parent_event_id
  ON market_sports (sports_parent_event_id);

CREATE INDEX IF NOT EXISTS idx_market_sports_game_id
  ON market_sports (sports_game_id);

CREATE INDEX IF NOT EXISTS idx_market_sports_event_fk
  ON market_sports (event_id);

CREATE INDEX IF NOT EXISTS idx_market_sports_event_slug
  ON market_sports (sports_event_slug);

CREATE INDEX IF NOT EXISTS idx_market_sports_teams_gin
  ON market_sports
  USING GIN (sports_teams);

ALTER TABLE event_sports
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE market_sports
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_event_sports" ON "event_sports";
CREATE POLICY "service_role_all_event_sports"
  ON "event_sports"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "service_role_all_market_sports" ON "market_sports";
CREATE POLICY "service_role_all_market_sports"
  ON "market_sports"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (TRUE)
  WITH CHECK (TRUE);

-- Migration: 2026_02_24_001_sports_menu_items.sql (truncated for brevity - includes extensive sports menu data)
CREATE TABLE IF NOT EXISTS sports_menu_items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  label TEXT,
  href TEXT,
  icon_url TEXT,
  parent_id TEXT,
  menu_slug TEXT,
  h1_title TEXT,
  mapped_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  url_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  games_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  props_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_menu_items_item_type_check CHECK (item_type IN ('link', 'group', 'header', 'divider')),
  CONSTRAINT sports_menu_items_mapped_tags_is_array CHECK (jsonb_typeof(mapped_tags) = 'array'),
  CONSTRAINT sports_menu_items_url_aliases_is_array CHECK (jsonb_typeof(url_aliases) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_sports_menu_items_parent_id
  ON sports_menu_items (parent_id);

CREATE INDEX IF NOT EXISTS idx_sports_menu_items_sort_order
  ON sports_menu_items (sort_order);

CREATE INDEX IF NOT EXISTS idx_sports_menu_items_enabled
  ON sports_menu_items (enabled);

CREATE INDEX IF NOT EXISTS idx_sports_menu_items_menu_slug
  ON sports_menu_items (menu_slug);

-- Note: Full sports menu data insertion omitted for brevity
-- The actual migration file contains extensive INSERT statements for sports menu items

-- Migration: 2026_03_15_001_allowed_market_creators.sql
CREATE TABLE IF NOT EXISTS allowed_market_creators (
  wallet_address TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT allowed_market_creators_wallet_address_check CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT allowed_market_creators_source_type_check CHECK (source_type IN ('site', 'wallet')),
  CONSTRAINT allowed_market_creators_source_url_check CHECK (
    (source_type = 'site' AND source_url IS NOT NULL)
    OR (source_type = 'wallet' AND source_url IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_allowed_market_creators_source_type
  ON allowed_market_creators (source_type);

CREATE INDEX IF NOT EXISTS idx_allowed_market_creators_source_url
  ON allowed_market_creators (source_url);

ALTER TABLE allowed_market_creators
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_allowed_market_creators" ON "allowed_market_creators";
CREATE POLICY "service_role_all_allowed_market_creators"
  ON "allowed_market_creators"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (TRUE)
  WITH CHECK (TRUE);

DROP TRIGGER IF EXISTS set_allowed_market_creators_updated_at ON allowed_market_creators;
CREATE TRIGGER set_allowed_market_creators_updated_at
  BEFORE UPDATE
  ON allowed_market_creators
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO allowed_market_creators (
  wallet_address,
  display_name,
  source_url,
  source_type
)
VALUES (
  '0x183d590c4d7f74b11f265ff131bfe3259a25969b',
  'demo.kuest.com',
  'https://demo.kuest.com',
  'site'
)
ON CONFLICT (wallet_address) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  source_url = EXCLUDED.source_url,
  source_type = EXCLUDED.source_type,
  updated_at = NOW();

-- Migration: 2026_03_21_001_event_visibility.sql
ALTER TABLE events
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- Migration: 2026_03_22_001_event_creations.sql
CREATE TABLE IF NOT EXISTS event_creations (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  source_event_id CHAR(26) REFERENCES events(id) ON DELETE SET NULL ON UPDATE CASCADE,
  deployed_event_id CHAR(26) REFERENCES events(id) ON DELETE SET NULL ON UPDATE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled draft',
  slug TEXT,
  title_template TEXT,
  slug_template TEXT,
  creation_mode TEXT NOT NULL DEFAULT 'single',
  status TEXT NOT NULL DEFAULT 'draft',
  start_at TIMESTAMPTZ,
  deploy_at TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  wallet_address CHAR(42),
  draft_payload JSONB,
  asset_payload JSONB,
  main_category_slug TEXT,
  category_slugs TEXT[] NOT NULL DEFAULT '{}'::text[],
  market_mode TEXT,
  binary_question TEXT,
  binary_outcome_yes TEXT,
  binary_outcome_no TEXT,
  resolution_source TEXT,
  resolution_rules TEXT,
  recurrence_unit TEXT,
  recurrence_interval INTEGER,
  recurrence_until TIMESTAMPTZ,
  pending_request_id TEXT,
  pending_payload_hash CHAR(66),
  pending_chain_id INTEGER,
  pending_confirmed_txs JSONB,
  last_run_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_creations_creation_mode_check CHECK (creation_mode IN ('single', 'recurring')),
  CONSTRAINT event_creations_status_check CHECK (status IN ('draft', 'scheduled', 'running', 'deployed', 'failed', 'canceled')),
  CONSTRAINT event_creations_wallet_address_check CHECK (wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT event_creations_market_mode_check CHECK (market_mode IS NULL OR market_mode IN ('binary', 'multi_multiple', 'multi_unique')),
  CONSTRAINT event_creations_recurrence_unit_check CHECK (
    recurrence_unit IS NULL OR recurrence_unit IN ('minute', 'hour', 'day', 'week', 'month', 'quarter', 'semiannual', 'year')
  ),
  CONSTRAINT event_creations_recurrence_interval_check CHECK (recurrence_interval IS NULL OR recurrence_interval > 0)
);

CREATE INDEX IF NOT EXISTS idx_event_creations_created_by_status
  ON event_creations (created_by_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_creations_status_deploy_at
  ON event_creations (status, deploy_at);

CREATE INDEX IF NOT EXISTS idx_event_creations_start_at
  ON event_creations (start_at);

CREATE INDEX IF NOT EXISTS idx_event_creations_source_event_id
  ON event_creations (source_event_id);

ALTER TABLE event_creations
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_event_creations" ON "event_creations";
CREATE POLICY "service_role_all_event_creations"
  ON "event_creations"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (TRUE)
  WITH CHECK (TRUE);

DROP TRIGGER IF EXISTS set_event_creations_updated_at ON event_creations;
CREATE TRIGGER set_event_creations_updated_at
  BEFORE UPDATE
  ON event_creations
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 2026_03_31_001_sports_menu_sidebar_spec_rows.sql
INSERT INTO sports_menu_items (
  id,
  item_type,
  label,
  href,
  icon_url,
  parent_id,
  menu_slug,
  h1_title,
  mapped_tags,
  url_aliases,
  games_enabled,
  props_enabled,
  sort_order,
  enabled
)
VALUES
  (
    'group-basketball-10-link-cwbb-sports-cwbb-games-11',
    'link',
    'CWBB',
    '/sports/cwbb/games',
    '/images/sports/menu/full/sub-basketball-ncaab-cbb-games.svg',
    'group-basketball-10',
    'cwbb',
    'CWBB',
    '["CWBB"]'::jsonb,
    '[]'::jsonb,
    TRUE,
    FALSE,
    11,
    TRUE
  ),
  (
    'group-cricket-16-link-legends-sports-criclcl-games-15',
    'link',
    'Legends',
    '/sports/criclcl/games',
    '/images/sports/menu/full/top-cricket-crint-games.svg',
    'top-link-cricket-sports-crint-games-16',
    'criclcl',
    'Legends',
    '["Legends","Legends Cricket League"]'::jsonb,
    '["legends-cricket-league"]'::jsonb,
    TRUE,
    FALSE,
    15,
    TRUE
  ),
  (
    'group-cricket-16-link-national-t20-cup-sports-cricpakt20cup-games-16',
    'link',
    'National T20 Cup',
    '/sports/cricpakt20cup/games',
    '/images/sports/menu/full/top-cricket-crint-games.svg',
    'top-link-cricket-sports-crint-games-16',
    'cricpakt20cup',
    'National T20 Cup',
    '["National T20 Cup"]'::jsonb,
    '[]'::jsonb,
    TRUE,
    FALSE,
    16,
    TRUE
  )
ON CONFLICT (id) DO UPDATE
SET
  item_type = EXCLUDED.item_type,
  label = EXCLUDED.label,
  href = EXCLUDED.href,
  icon_url = EXCLUDED.icon_url,
  parent_id = EXCLUDED.parent_id,
  menu_slug = EXCLUDED.menu_slug,
  h1_title = EXCLUDED.h1_title,
  mapped_tags = EXCLUDED.mapped_tags,
  url_aliases = EXCLUDED.url_aliases,
  games_enabled = EXCLUDED.games_enabled,
  props_enabled = EXCLUDED.props_enabled,
  sort_order = EXCLUDED.sort_order,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

UPDATE sports_menu_items
SET
  games_enabled = TRUE,
  props_enabled = FALSE,
  updated_at = NOW()
WHERE id = 'top-link-chess-sports-chess-props-21';

-- Migration: 2026_04_01_001_subgraph_syncs_integer_id.sql
INSERT INTO subgraph_syncs (service_name, subgraph_name, status, total_processed, error_message)
VALUES
  ('market_sync', 'pnl', 'idle', 0, NULL),
  ('resolution_sync', 'resolution', 'idle', 0, NULL)
ON CONFLICT (service_name, subgraph_name) DO NOTHING;

UPDATE subgraph_syncs
SET
  status = 'idle',
  error_message = NULL,
  updated_at = NOW()
WHERE (service_name, subgraph_name) IN (
  ('market_sync', 'pnl'),
  ('resolution_sync', 'resolution')
);

SELECT setval(
  pg_get_serial_sequence('subgraph_syncs', 'id'),
  COALESCE((SELECT MAX(id) FROM subgraph_syncs), 1),
  true
);

-- Migration: 2026_04_03_002_event_sports_league_fields.sql
ALTER TABLE event_sports
  ADD COLUMN IF NOT EXISTS sports_league_label TEXT;

ALTER TABLE event_sports
  ADD COLUMN IF NOT EXISTS sports_league_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_event_sports_league_slug
  ON event_sports (sports_league_slug);

-- Migration: 2026_04_06_001_bucket_allow_pdf_assets.sql
DO
$$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'storage'
        AND table_name = 'buckets'
    ) THEN
      UPDATE storage.buckets
      SET
        file_size_limit = 2097152,
        allowed_mime_types = ARRAY(
          SELECT DISTINCT mime
          FROM unnest(
            COALESCE(allowed_mime_types, ARRAY[]::text[])
            || ARRAY['application/pdf']
          ) AS mime
        )
      WHERE id = 'slimefish-assets';
    END IF;
  END
$$;

-- Migration: 2026_04_06_002_market_context_cache.sql
CREATE TABLE IF NOT EXISTS market_context_cache (
  condition_id TEXT NOT NULL REFERENCES markets (condition_id) ON DELETE CASCADE ON UPDATE CASCADE,
  locale TEXT NOT NULL,
  context TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (condition_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_market_context_cache_expires_at
  ON market_context_cache (expires_at);

ALTER TABLE market_context_cache
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_market_context_cache" ON "market_context_cache";
CREATE POLICY "service_role_all_market_context_cache"
  ON "market_context_cache"
  AS PERMISSIVE
  FOR ALL
  TO "service_role"
  USING (TRUE)
  WITH CHECK (TRUE);

DROP TRIGGER IF EXISTS set_market_context_cache_updated_at ON market_context_cache;
CREATE TRIGGER set_market_context_cache_updated_at
  BEFORE UPDATE
  ON market_context_cache
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 2026_04_08_001_bnb_live_chart_config.sql
INSERT INTO event_live_chart_configs (
  series_slug,
  topic,
  event_type,
  symbol,
  display_name,
  display_symbol,
  line_color,
  icon_path,
  enabled,
  show_price_decimals,
  active_window_minutes
)
VALUES (
  'bnb-up-or-down-daily',
  'crypto_prices_chainlink',
  'update',
  'bnb/usd',
  'BNB',
  'BNB/USD',
  '#F0B90B',
  '/images/live-assets/bnb.svg',
  TRUE,
  FALSE,
  1440
)
ON CONFLICT (series_slug) DO UPDATE
SET
  topic = EXCLUDED.topic,
  event_type = EXCLUDED.event_type,
  symbol = EXCLUDED.symbol,
  display_name = EXCLUDED.display_name,
  display_symbol = EXCLUDED.display_symbol,
  line_color = EXCLUDED.line_color,
  icon_path = EXCLUDED.icon_path,
  enabled = EXCLUDED.enabled,
  show_price_decimals = EXCLUDED.show_price_decimals,
  active_window_minutes = EXCLUDED.active_window_minutes,
  updated_at = NOW();

-- Migration: 2026_04_10_001_two_factors_verified.sql
ALTER TABLE two_factors
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT TRUE;

-- Migration: 2026_04_13_001_tag_event_page_note.sql
ALTER TABLE tags
  ADD COLUMN IF NOT EXISTS event_page_note TEXT;

-- Migration: 2026_04_13_002_volume_sync_cursor.sql
INSERT INTO subgraph_syncs (service_name, subgraph_name, status, total_processed, error_message, cursor_id)
VALUES
  ('volume_sync', 'volume', 'idle', 0, NULL, NULL)
ON CONFLICT (service_name, subgraph_name) DO NOTHING;

UPDATE subgraph_syncs
SET
  status = 'idle',
  error_message = NULL,
  updated_at = NOW()
WHERE (service_name, subgraph_name) IN (
  ('volume_sync', 'volume')
);

CREATE INDEX IF NOT EXISTS idx_markets_active_resolved_condition_id
  ON markets (is_active, is_resolved, condition_id);

-- Migration: 2026_05_02_001_affiliate_builder_fee_settings.sql
INSERT INTO settings ("group", key, value)
VALUES (
  'affiliate',
  'builder_taker_fee_bps',
  COALESCE((
    SELECT value
    FROM settings
    WHERE "group" = 'affiliate'
      AND key = 'trade_fee_bps'
  ), '100')
),
('affiliate', 'builder_maker_fee_bps', '0')
ON CONFLICT ("group", key) DO NOTHING;

DELETE FROM settings
WHERE "group" = 'affiliate'
  AND key = 'trade_fee_bps';

-- Migration: 2026_05_06_001_deposit_wallet_cutover.sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'proxy_wallet_address'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'deposit_wallet_address'
  ) THEN
    ALTER TABLE users RENAME COLUMN proxy_wallet_address TO deposit_wallet_address;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'proxy_wallet_signature'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'deposit_wallet_signature'
  ) THEN
    ALTER TABLE users RENAME COLUMN proxy_wallet_signature TO deposit_wallet_signature;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'proxy_wallet_signed_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'deposit_wallet_signed_at'
  ) THEN
    ALTER TABLE users RENAME COLUMN proxy_wallet_signed_at TO deposit_wallet_signed_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'proxy_wallet_status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'deposit_wallet_status'
  ) THEN
    ALTER TABLE users RENAME COLUMN proxy_wallet_status TO deposit_wallet_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'proxy_wallet_tx_hash'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'deposit_wallet_tx_hash'
  ) THEN
    ALTER TABLE users RENAME COLUMN proxy_wallet_tx_hash TO deposit_wallet_tx_hash;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_proxy_wallet_address')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_deposit_wallet_address')
  THEN
    ALTER INDEX idx_users_proxy_wallet_address RENAME TO idx_users_deposit_wallet_address;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users' AND constraint_name = 'users_username_unique'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_username_unique;
  ELSIF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_username_unique') THEN
    DROP INDEX users_username_unique;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_deposit_wallet_address
  ON users (LOWER(deposit_wallet_address));

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON users (LOWER(username));

ALTER TABLE users
  ALTER COLUMN deposit_wallet_status DROP NOT NULL,
  ALTER COLUMN deposit_wallet_status DROP DEFAULT;

-- Migration: 2026_05_10_002_resolve_hide_legacy_markets.sql (skipped - only for existing data)

-- Migration: 2026_05_11_001_dogecoin_live_chart_config.sql
INSERT INTO event_live_chart_configs (
  series_slug,
  topic,
  event_type,
  symbol,
  display_name,
  display_symbol,
  line_color,
  icon_path,
  enabled,
  show_price_decimals,
  active_window_minutes
)
VALUES (
  'dogecoin-up-or-down-daily',
  'crypto_prices_chainlink',
  'update',
  'doge/usd',
  'Dogecoin',
  'DOGE/USD',
  '#C2A633',
  '/images/live-assets/doge.svg',
  TRUE,
  FALSE,
  1440
)
ON CONFLICT (series_slug) DO UPDATE
SET
  topic = EXCLUDED.topic,
  event_type = EXCLUDED.event_type,
  symbol = EXCLUDED.symbol,
  display_name = EXCLUDED.display_name,
  display_symbol = EXCLUDED.display_symbol,
  line_color = EXCLUDED.line_color,
  icon_path = EXCLUDED.icon_path,
  enabled = EXCLUDED.enabled,
  show_price_decimals = EXCLUDED.show_price_decimals,
  active_window_minutes = EXCLUDED.active_window_minutes,
  updated_at = NOW();

-- Migration: 2026_05_20_001_settings_trigger_preserve_explicit_updated_at.sql
CREATE OR REPLACE FUNCTION public.set_settings_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RETURN NEW;
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_settings_updated_at ON settings;

CREATE TRIGGER set_settings_updated_at
  BEFORE UPDATE
  ON settings
  FOR EACH ROW
EXECUTE FUNCTION set_settings_updated_at();

-- Migration: 2026_05_21_001_hype_live_chart_config.sql
INSERT INTO event_live_chart_configs (
  series_slug,
  topic,
  event_type,
  symbol,
  display_name,
  display_symbol,
  line_color,
  icon_path,
  enabled,
  show_price_decimals,
  active_window_minutes
)
VALUES (
  'hype-up-or-down-daily',
  'crypto_prices_chainlink',
  'update',
  'hype/usd',
  'HYPE',
  'HYPE/USD',
  '#00C2A8',
  '/images/live-assets/hype.svg',
  TRUE,
  FALSE,
  1440
)
ON CONFLICT (series_slug) DO UPDATE
SET
  topic = EXCLUDED.topic,
  event_type = EXCLUDED.event_type,
  symbol = EXCLUDED.symbol,
  display_name = EXCLUDED.display_name,
  display_symbol = EXCLUDED.display_symbol,
  line_color = EXCLUDED.line_color,
  icon_path = EXCLUDED.icon_path,
  enabled = EXCLUDED.enabled,
  show_price_decimals = EXCLUDED.show_price_decimals,
  active_window_minutes = EXCLUDED.active_window_minutes,
  updated_at = NOW();

-- Migration: 2026_05_31_001_event_additional_context.sql
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS additional_context TEXT,
  ADD COLUMN IF NOT EXISTS additional_context_updated_at TIMESTAMPTZ;

-- Migration: 2026_06_09_001_users_username_search_index.sql
CREATE INDEX IF NOT EXISTS idx_users_username_lower_gin_trgm
  ON users USING GIN (LOWER(username) gin_trgm_ops);

-- Migration: 2026_06_17_001_missing_sports_sidebar_rows.sql (skipped - extensive data)

-- Migration: 2026_06_19_001_reset_exchange_approvals.sql
UPDATE users
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{tradingAuth,approvals}',
  '{"completed": false, "updatedAt": null, "version": "deposit-wallet-2026-06-new-exchanges"}'::jsonb,
  true
)
WHERE COALESCE(settings #>> '{tradingAuth,approvals,version}', '') <> 'deposit-wallet-2026-06-new-exchanges'
   OR settings #>> '{tradingAuth,approvals,completed}' = 'true';

-- Migration: 2026_06_27_001_reset_auto_redeem_approvals.sql
UPDATE users
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{tradingAuth,autoRedeem}',
  '{"completed": false, "updatedAt": null, "version": "deposit-wallet-2026-06-auto-redeem-11735b"}'::jsonb,
  true
)
WHERE settings #> '{tradingAuth,autoRedeem}' IS NOT NULL
  AND (
    COALESCE(settings #>> '{tradingAuth,autoRedeem,version}', '') <> 'deposit-wallet-2026-06-auto-redeem-11735b'
    OR settings #>> '{tradingAuth,autoRedeem,completed}' = 'true'
  );

-- Migration: 2026_06_28_001_home_featured_events.sql
CREATE TABLE IF NOT EXISTS home_featured_events (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  target_type TEXT NOT NULL DEFAULT 'event',
  event_id CHAR(26) REFERENCES events (id) ON DELETE CASCADE ON UPDATE CASCADE,
  series_slug TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rank INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  context_mode TEXT NOT NULL DEFAULT 'auto',
  auto_rollover_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (target_type IN ('event', 'series')),
  CHECK (source IN ('manual', 'ai')),
  CHECK (context_mode IN ('auto', 'news', 'comments', 'hidden')),
  CHECK (
    (target_type = 'event' AND event_id IS NOT NULL AND series_slug IS NULL)
    OR (target_type = 'series' AND event_id IS NULL AND TRIM(COALESCE(series_slug, '')) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_home_featured_events_enabled_rank
  ON home_featured_events (enabled, rank);

CREATE INDEX IF NOT EXISTS idx_home_featured_events_event_id
  ON home_featured_events (event_id);

CREATE INDEX IF NOT EXISTS idx_home_featured_events_series_slug
  ON home_featured_events (series_slug);

CREATE INDEX IF NOT EXISTS idx_home_featured_events_starts_at
  ON home_featured_events (starts_at);

CREATE INDEX IF NOT EXISTS idx_home_featured_events_ends_at
  ON home_featured_events (ends_at);

ALTER TABLE home_featured_events
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_home_featured_events" ON "home_featured_events";
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE POLICY "service_role_all_home_featured_events"
      ON "home_featured_events"
      AS PERMISSIVE
      FOR ALL
      TO "service_role"
      USING (TRUE)
      WITH CHECK (TRUE);
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_home_featured_events_updated_at ON home_featured_events;
CREATE TRIGGER set_home_featured_events_updated_at
  BEFORE UPDATE
  ON home_featured_events
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS home_featured_event_context_items (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  featured_event_id CHAR(26) NOT NULL REFERENCES home_featured_events (id) ON DELETE CASCADE ON UPDATE CASCADE,
  event_id CHAR(26) NOT NULL REFERENCES events (id) ON DELETE CASCADE ON UPDATE CASCADE,
  locale TEXT NOT NULL DEFAULT 'en',
  item_type TEXT NOT NULL DEFAULT 'news',
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  favicon_url TEXT,
  published_at TIMESTAMPTZ,
  relevance_score DECIMAL(8, 4),
  is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (item_type IN ('news', 'comment')),
  CHECK (relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 1))
);

CREATE INDEX IF NOT EXISTS idx_home_featured_context_featured_locale
  ON home_featured_event_context_items (featured_event_id, locale);

CREATE INDEX IF NOT EXISTS idx_home_featured_context_event_locale_expires
  ON home_featured_event_context_items (event_id, locale, expires_at);

CREATE INDEX IF NOT EXISTS idx_home_featured_context_expires_at
  ON home_featured_event_context_items (expires_at);

ALTER TABLE home_featured_event_context_items
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_home_featured_event_context_items" ON "home_featured_event_context_items";
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE POLICY "service_role_all_home_featured_event_context_items"
      ON "home_featured_event_context_items"
      AS PERMISSIVE
      FOR ALL
      TO "service_role"
      USING (TRUE)
      WITH CHECK (TRUE);
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_home_featured_event_context_items_updated_at ON home_featured_event_context_items;
CREATE TRIGGER set_home_featured_event_context_items_updated_at
  BEFORE UPDATE
  ON home_featured_event_context_items
  FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ===========================================
-- Migrations Complete
-- ===========================================

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "withdrawal_phone_pin_hash" text,
  ADD COLUMN IF NOT EXISTS "withdrawal_phone_pin_set_at" timestamp;

ALTER TABLE "payment_intents"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "idx_payment_intents_expiry"
  ON "payment_intents" ("status", "expires_at")
  WHERE "expires_at" IS NOT NULL;

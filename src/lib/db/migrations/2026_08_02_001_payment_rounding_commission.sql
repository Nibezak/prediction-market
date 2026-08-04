ALTER TABLE payment_intents
  ALTER COLUMN platform_fee TYPE numeric(20,8)
  USING platform_fee::numeric(20,8);

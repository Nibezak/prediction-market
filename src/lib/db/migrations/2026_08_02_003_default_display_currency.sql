ALTER TABLE users
  ALTER COLUMN settings SET DEFAULT '{"display":{"currency":"KES"},"trading":{"market_order_type":"FAK","show_slippage_warning":true}}'::jsonb;

UPDATE users
SET settings = jsonb_set(
  CASE
    WHEN jsonb_typeof(COALESCE(settings, '{}'::jsonb)) = 'object' THEN COALESCE(settings, '{}'::jsonb)
    ELSE '{}'::jsonb
  END,
  '{display}',
  CASE
    WHEN jsonb_typeof(COALESCE(settings, '{}'::jsonb)->'display') = 'object'
      THEN (COALESCE(settings, '{}'::jsonb)->'display') || '{"currency":"KES"}'::jsonb
    ELSE '{"currency":"KES"}'::jsonb
  END,
  true
)
WHERE COALESCE(settings->'display'->>'currency', '') NOT IN ('KES', 'USD');

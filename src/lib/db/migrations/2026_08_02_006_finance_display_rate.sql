INSERT INTO settings ("group", key, value)
VALUES ('finance', 'kes_per_usd', '130')
ON CONFLICT ("group", key) DO NOTHING;

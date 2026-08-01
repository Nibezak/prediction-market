ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_category_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_category_check
  CHECK (category IN (
    'trade',
    'system',
    'general',
    'account',
    'finance',
    'money',
    'comment_reply',
    'security',
    'market',
    'community'
  ));

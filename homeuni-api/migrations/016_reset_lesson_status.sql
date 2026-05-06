-- Reset lesson statuses that were set by the old 90s auto-complete timer.
-- The auto-complete was removed; statuses should be user-driven only.
-- All lessons revert to not_started so students can mark completion manually.
UPDATE lessons SET status = 'not_started' WHERE status = 'complete';

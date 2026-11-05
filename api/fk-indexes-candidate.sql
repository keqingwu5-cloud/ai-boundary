-- CANDIDATE ONLY. Manual review and isolated-database validation required.
-- Evidence: Supabase performance advisor (2026-11-05) flagged two unindexed FKs.
-- Prerequisites: api/schema.sql and api/persistence-candidate.sql.
-- Do NOT apply automatically in CI or production.
-- These indexes improve FK lookup/deletion checks; they do not fix concurrency,
-- downstream revocation, or prove backup/restore correctness.
CREATE INDEX IF NOT EXISTS event_logs_event_id_fk_idx
  ON mainbrain_api.event_logs (event_id);
CREATE INDEX IF NOT EXISTS events_grant_id_fk_idx
  ON mainbrain_api.events (grant_id);
-- Preserve existing grants_lookup_idx and alerts_open_idx until workload evidence
-- justifies any change; low-traffic "unused" findings are not removal approval.

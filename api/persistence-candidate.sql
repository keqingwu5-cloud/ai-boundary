-- CANDIDATE migration: apply only to an approved, isolated PostgreSQL database.
-- Prerequisite: api/schema.sql. NEVER auto-apply in CI or on production.
-- Grants are provisioned by a separately authorised administrator, not by agents.
CREATE TABLE IF NOT EXISTS mainbrain_api.grants (
  grant_id text PRIMARY KEY,
  task_id text NOT NULL,
  source_endpoint_id text NOT NULL,
  destination_endpoint_id text NOT NULL,
  allowed_actions text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  stopped boolean NOT NULL DEFAULT false,
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grants_lookup_idx
  ON mainbrain_api.grants(task_id, source_endpoint_id, destination_endpoint_id, expires_at);

ALTER TABLE mainbrain_api.events
  ADD COLUMN IF NOT EXISTS grant_id text REFERENCES mainbrain_api.grants(grant_id);
-- Existing events are untrusted until explicitly reauthorised. Candidate store
-- refuses any event without a grant_id. No silent backfill is performed.
CREATE TABLE IF NOT EXISTS mainbrain_api.attempts (
  event_id text NOT NULL REFERENCES mainbrain_api.events(event_id),
  attempt_id uuid NOT NULL,
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  leased_at timestamptz NOT NULL,
  lease_until timestamptz NOT NULL,
  PRIMARY KEY(event_id, attempt_id),
  UNIQUE(event_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS attempts_latest_idx ON mainbrain_api.attempts(event_id, attempt_no DESC);
-- No public/client role may write the queue or the grants table.
REVOKE ALL ON SCHEMA mainbrain_api FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA mainbrain_api FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA mainbrain_api FROM PUBLIC, anon, authenticated;
-- Production requires a dedicated least-privileged worker DB role, separate
-- human-controlled grant issuer, RLS/privilege audit and approved migrations.

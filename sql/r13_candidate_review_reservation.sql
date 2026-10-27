-- R13 / G1 / ISOLATED SQL CANDIDATE ONLY / DO NOT APPLY TO PRODUCTION.
-- This is a multi-session PostgreSQL replay RESERVATION for human review only.
-- NOT an execution permit, cryptographic trust anchor, owner ACK or dispatcher.
-- In CI, load ONLY into a throwaway Docker database with no published port.
-- Never expose this schema to public/anon/app clients; exact production roles
-- and authorization controls require owner + independent G2 approval.
CREATE SCHEMA IF NOT EXISTS tcvl_r13_candidate;
REVOKE ALL ON SCHEMA tcvl_r13_candidate FROM PUBLIC;

CREATE TABLE IF NOT EXISTS tcvl_r13_candidate.review_reservations (
  receipt_id text PRIMARY KEY CHECK (receipt_id ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  key_id text NOT NULL CHECK (key_id ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  project_id text NOT NULL CHECK (project_id ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  direction_version text NOT NULL CHECK (direction_version ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Intentionally no approved / execution_allowed / dispatched state.
  stage text NOT NULL DEFAULT 'review_reserved'
       CHECK (stage = 'review_reserved')
);
REVOKE ALL ON TABLE tcvl_r13_candidate.review_reservations FROM PUBLIC;

CREATE TABLE IF NOT EXISTS tcvl_r13_candidate.revocations (
  kind text NOT NULL CHECK(kind IN ('receipt','key')),
  ref_id text NOT NULL CHECK(ref_id ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(kind, ref_id)
);
REVOKE ALL ON TABLE tcvl_r13_candidate.revocations FROM PUBLIC;

-- Conservative order: lock key, then receipt. All key revocation functions
-- must lock key; receipt revocations use receipt lock only. Collisions in the
-- advisory hash create extra serialization, not extra approvals.
-- SECURITY INVOKER: NEVER a public privileged SECURITY DEFINER shortcut.
CREATE OR REPLACE FUNCTION tcvl_r13_candidate.reserve_review_only(
  p_receipt_id text, p_key_id text, p_project_id text,
  p_direction_version text, p_evidence_digest text,
  p_expires_at timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, tcvl_r13_candidate
AS $fn$
DECLARE v_inserted text;
BEGIN
  IF p_receipt_id IS NULL OR p_receipt_id !~ '^[A-Za-z0-9_.:-]{1,120}$'
    OR p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_.:-]{1,120}$'
    OR p_project_id IS NULL OR p_project_id !~ '^[A-Za-z0-9_.:-]{1,120}$'
    OR p_direction_version IS NULL OR p_direction_version !~ '^[A-Za-z0-9_.:-]{1,120}$'
    OR p_evidence_digest IS NULL OR p_evidence_digest !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL THEN
    RETURN 'BLOCKED_INVALID_CANDIDATE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('tcvl_r13_key:' || p_key_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('tcvl_r13_receipt:' || p_receipt_id, 0));
  IF EXISTS(SELECT 1 FROM tcvl_r13_candidate.revocations
    WHERE (kind='key' AND ref_id=p_key_id)
       OR (kind='receipt' AND ref_id=p_receipt_id)) THEN
    RETURN 'BLOCKED_REVOKED';
  END IF;
  IF p_expires_at <= clock_timestamp() THEN RETURN 'BLOCKED_EXPIRED'; END IF;
  INSERT INTO tcvl_r13_candidate.review_reservations
    (receipt_id, key_id, project_id, direction_version, evidence_digest, expires_at)
  VALUES(p_receipt_id,p_key_id,p_project_id,p_direction_version,p_evidence_digest,p_expires_at)
  ON CONFLICT (receipt_id) DO NOTHING
  RETURNING receipt_id INTO v_inserted;
  IF v_inserted IS NULL THEN RETURN 'BLOCKED_REPLAY_OR_CONFLICT'; END IF;
  RETURN 'REVIEW_RESERVED_ONLY';
END;
$fn$;
REVOKE ALL ON FUNCTION tcvl_r13_candidate.reserve_review_only(
 text,text,text,text,text,timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION tcvl_r13_candidate.revoke_key_for_review(
 p_key_id text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, tcvl_r13_candidate AS $fn$
BEGIN
 IF p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_.:-]{1,120}$'
 THEN RETURN 'BLOCKED_INVALID_CANDIDATE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tcvl_r13_key:' || p_key_id,0));
 INSERT INTO tcvl_r13_candidate.revocations(kind,ref_id)
 VALUES('key',p_key_id) ON CONFLICT(kind,ref_id) DO NOTHING;
 RETURN 'REVIEW_KEY_REVOKED';
END;
$fn$;
REVOKE ALL ON FUNCTION tcvl_r13_candidate.revoke_key_for_review(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION tcvl_r13_candidate.revoke_receipt_for_review(
 p_receipt_id text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, tcvl_r13_candidate AS $fn$
BEGIN
 IF p_receipt_id IS NULL OR p_receipt_id !~ '^[A-Za-z0-9_.:-]{1,120}$'
 THEN RETURN 'BLOCKED_INVALID_CANDIDATE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tcvl_r13_receipt:' || p_receipt_id,0));
 INSERT INTO tcvl_r13_candidate.revocations(kind,ref_id)
 VALUES('receipt',p_receipt_id) ON CONFLICT(kind,ref_id) DO NOTHING;
 RETURN 'REVIEW_RECEIPT_REVOKED';
END;
$fn$;
REVOKE ALL ON FUNCTION tcvl_r13_candidate.revoke_receipt_for_review(text) FROM PUBLIC;

-- IMPORTANT:
-- * No GRANTs are made. Test SQL runs as privileged PostgreSQL container owner.
-- * Production key custody, authn, issuer policy, permitted reviewer role,
--   RLS, immutable audit logs, migration/backups and dispatch are NOT provided.
-- * The calling service MUST check R11 cryptographic bindings beforehand, but
--   this SQL cannot verify the caller nor make those checks authoritative.
-- * No irreversible external side effect may be started by this result.

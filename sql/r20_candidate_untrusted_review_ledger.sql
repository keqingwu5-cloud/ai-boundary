-- R20 G1, THROWAWAY POSTGRES ONLY. NOT A PRODUCTION MIGRATION.
-- Persists UNSIGNED / UNTRUSTED REVIEW METADATA, not approval.
-- Caller-provided JSONB is not signed by an independently trusted owner.
-- No GRANT, no dispatch, no trusted issuer, no full authorization.
CREATE SCHEMA IF NOT EXISTS tcvl_r20_candidate;
REVOKE ALL ON SCHEMA tcvl_r20_candidate FROM PUBLIC;
CREATE TABLE tcvl_r20_candidate.review_metadata (
  receipt_id text PRIMARY KEY CHECK (receipt_id ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  nonce text NOT NULL UNIQUE CHECK (nonce ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  envelope jsonb NOT NULL,
  stage text NOT NULL DEFAULT 'untrusted_metadata_only'
    CHECK(stage='untrusted_metadata_only'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(envelope->>'receipt_id'=receipt_id),
  CHECK(envelope->>'nonce'=nonce)
);
REVOKE ALL ON TABLE tcvl_r20_candidate.review_metadata FROM PUBLIC;
CREATE TABLE tcvl_r20_candidate.review_revocations (
 kind text NOT NULL CHECK(kind IN ('receipt','key','node')),
 ref_id text NOT NULL CHECK(ref_id ~ '^[A-Za-z0-9_.:-]{1,120}$'),
 revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(kind,ref_id)
);
REVOKE ALL ON TABLE tcvl_r20_candidate.review_revocations FROM PUBLIC;

CREATE OR REPLACE FUNCTION tcvl_r20_candidate.reserve_untrusted_metadata(p jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,tcvl_r20_candidate
AS $fn$
DECLARE
 v_n int; v_field text; v_receipt text; v_nonce text;
 v_key text; v_node text; v_scope text[];
 v_issue timestamptz; v_expiry timestamptz; v_row text;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' THEN
  RETURN 'BLOCKED_INVALID_METADATA';
 END IF;
 SELECT count(*) INTO v_n FROM jsonb_object_keys(p);
 IF v_n<>18 OR p->>'schema'<>'tcvl.review-receipt/v2-candidate'
  OR p->>'purpose'<>'reserve_for_independent_review'
  OR p->>'claim_status'<>'review_requested' THEN
  RETURN 'BLOCKED_INVALID_METADATA'; END IF;

 FOREACH v_field IN ARRAY ARRAY[
  'project_id','task_id','node_id','origin_command_id','direction_version',
  'request_id','audience','approver_id','key_id','receipt_id','nonce'
 ] LOOP
  IF jsonb_typeof(p->v_field) IS DISTINCT FROM 'string'
   OR (p->>v_field) !~ '^[A-Za-z0-9_.:-]{1,120}$' THEN
   RETURN 'BLOCKED_INVALID_METADATA'; END IF;
 END LOOP;
 IF jsonb_typeof(p->'evidence_digest') IS DISTINCT FROM 'string'
  OR (p->>'evidence_digest') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(p->'permissions_scope') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p->'permissions_scope') NOT BETWEEN 1 AND 24
  OR EXISTS (SELECT 1 FROM jsonb_array_elements(p->'permissions_scope') v(x)
    WHERE jsonb_typeof(v.x)<>'string' OR
     trim(both '"' from v.x::text) !~ '^[A-Za-z0-9_.:-]{1,120}$') THEN
  RETURN 'BLOCKED_INVALID_METADATA'; END IF;
 SELECT array_agg(x.value ORDER BY x.ordinality) INTO v_scope
 FROM jsonb_array_elements_text(p->'permissions_scope')
  WITH ORDINALITY x(value,ordinality);
 IF v_scope IS DISTINCT FROM
   ARRAY(SELECT DISTINCT val FROM unnest(v_scope) val ORDER BY val) THEN
  RETURN 'BLOCKED_INVALID_METADATA'; END IF;

 IF jsonb_typeof(p->'issued_at') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p->'expires_at') IS DISTINCT FROM 'string'
  OR p->>'issued_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
  OR p->>'expires_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' THEN
  RETURN 'BLOCKED_INVALID_METADATA'; END IF;
 v_issue:=(p->>'issued_at')::timestamptz;
 v_expiry:=(p->>'expires_at')::timestamptz;
 IF v_issue>clock_timestamp() OR v_expiry<=clock_timestamp()
  OR v_expiry<=v_issue OR v_expiry-v_issue>interval '10 minutes' THEN
  RETURN 'BLOCKED_STALE_METADATA'; END IF;

 v_receipt:=p->>'receipt_id';v_nonce:=p->>'nonce';
 v_key:=p->>'key_id';v_node:=p->>'node_id';
 -- All reserved/revoked operations follow key→node→receipt lock order.
 PERFORM pg_advisory_xact_lock(hashtextextended('r20-key:'||v_key,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('r20-node:'||v_node,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('r20-receipt:'||v_receipt,0));
 IF EXISTS(SELECT 1 FROM tcvl_r20_candidate.review_revocations
   WHERE (kind='receipt' AND ref_id=v_receipt)
   OR (kind='key' AND ref_id=v_key)
   OR (kind='node' AND ref_id=v_node)) THEN
  RETURN 'BLOCKED_REVOKED_METADATA'; END IF;
 INSERT INTO tcvl_r20_candidate.review_metadata(receipt_id,nonce,envelope)
 VALUES(v_receipt,v_nonce,p)
 ON CONFLICT DO NOTHING RETURNING receipt_id INTO v_row;
 IF v_row IS NULL THEN RETURN 'BLOCKED_DUPLICATE_RECEIPT_OR_NONCE'; END IF;
 RETURN 'UNTRUSTED_REVIEW_METADATA_RECORDED_ONLY';
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow
 THEN RETURN 'BLOCKED_INVALID_METADATA';
END;
$fn$;
REVOKE ALL ON FUNCTION tcvl_r20_candidate.reserve_untrusted_metadata(jsonb)
 FROM PUBLIC;

-- Revocation of untrusted metadata is NOT revocation of a real owner grant.
CREATE OR REPLACE FUNCTION tcvl_r20_candidate.revoke_untrusted_metadata(
 p_kind text,p_id text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,tcvl_r20_candidate
AS $fn$
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('receipt','key','node')
  OR p_id IS NULL OR p_id !~ '^[A-Za-z0-9_.:-]{1,120}$' THEN
  RETURN 'BLOCKED_INVALID_METADATA'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('r20-'||p_kind||':'||p_id,0));
 INSERT INTO tcvl_r20_candidate.review_revocations(kind,ref_id)
 VALUES(p_kind,p_id) ON CONFLICT DO NOTHING;
 RETURN 'UNTRUSTED_REVIEW_REFERENCE_REVOKED';
END;
$fn$;
REVOKE ALL ON FUNCTION tcvl_r20_candidate.revoke_untrusted_metadata(text,text)
 FROM PUBLIC;
-- No privilege grants and no executable approval / allow flag anywhere.
-- Neither SQL schema nor caller-provided JSON proves origin or signature.

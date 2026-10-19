-- CANDIDATE ONLY: do not apply to production without approval.
-- Dedicated API tables; no mutation of authoritative memory tables.
create schema if not exists mainbrain_api;
create table if not exists mainbrain_api.events (
 event_id text primary key, task_id text not null,
 source_endpoint_id text not null, destination_endpoint_id text not null,
 idempotency_key text not null, payload_version text not null,
 payload_digest char(64) not null, payload jsonb not null,
 state text not null check (state in ('queued','leased','executed','ack_received','failed','blocked')),
 attempt_count integer not null default 0,
 current_attempt_id uuid, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(source_endpoint_id,idempotency_key)
);
create index if not exists events_ready_idx on mainbrain_api.events(destination_endpoint_id,next_attempt_at) where state in ('queued','leased');
create table if not exists mainbrain_api.receipts (
 event_id text not null references mainbrain_api.events(event_id),
 attempt_id uuid not null, endpoint_id text not null,
 channel text not null check (channel in ('api','chat')),
 kind text not null check (kind in ('execution','ack','chat_read')),
 evidence jsonb not null, created_at timestamptz not null default now(),
 primary key(event_id,attempt_id,channel,kind)
);
create table if not exists mainbrain_api.event_logs (
 id bigint generated always as identity primary key,
 event_id text not null references mainbrain_api.events(event_id),
 actor_endpoint_id text, action text not null, detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
-- DB must be accessible only through privileged server-side adapter.
revoke all on schema mainbrain_api from public, anon, authenticated;
revoke all on all tables in schema mainbrain_api from public, anon, authenticated;
-- A production adapter must atomically lease with FOR UPDATE SKIP LOCKED,
-- use a transaction for receipt+state+log, and retry with bounded backoff.

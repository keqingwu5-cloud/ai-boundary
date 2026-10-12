-- Main Brain v0.1 / private D1 only (never embedded in GitHub Pages)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL,
 target TEXT NOT NULL CHECK(target IN ('GPT1','GPT2','BOT3')),
 title TEXT NOT NULL,
 instruction TEXT NOT NULL,
 completion_criteria TEXT NOT NULL DEFAULT '',
 stop_conditions TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','claimed','completed','failed','canceled')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 claimed_at TEXT,
 lease_until TEXT,
 lease_token TEXT,
 report TEXT,
 pitfalls_json TEXT,
 UNIQUE(request_id, target)
);
CREATE INDEX IF NOT EXISTS idx_tasks_target_state ON tasks(target,state,created_at);

CREATE TABLE IF NOT EXISTS memory_candidates (
 id TEXT PRIMARY KEY,
 event_type TEXT NOT NULL CHECK(event_type IN ('revise_answer','revise_question','new_question','pitfall','other')),
 parent_memory_id TEXT,
 original_question TEXT NOT NULL,
 purpose TEXT NOT NULL,
 summary TEXT NOT NULL,
 evidence_json TEXT NOT NULL DEFAULT '[]',
 alignment_state TEXT NOT NULL CHECK(alignment_state IN ('not_required','pending','confirmed','diverged')),
 source_agent TEXT NOT NULL,
 source_task_id TEXT,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected')),
 review_note TEXT,
 created_at TEXT NOT NULL,
 reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_candidates_state ON memory_candidates(state,created_at);

CREATE TABLE IF NOT EXISTS memory_items (
 id TEXT PRIMARY KEY,
 candidate_id TEXT NOT NULL UNIQUE REFERENCES memory_candidates(id),
 event_type TEXT NOT NULL,
 parent_memory_id TEXT,
 original_question TEXT NOT NULL,
 purpose TEXT NOT NULL,
 summary TEXT NOT NULL,
 evidence_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
 id TEXT PRIMARY KEY,
 event_type TEXT NOT NULL,
 actor TEXT NOT NULL,
 subject_id TEXT NOT NULL,
 details_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);

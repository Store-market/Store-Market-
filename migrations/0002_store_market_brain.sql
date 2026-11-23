-- Store Market Brain foundation. Apply after 0001_initial.sql.
-- This migration stores task metadata only; social access tokens must never be stored here.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS brain_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  agent TEXT NOT NULL CHECK(agent IN ('manager','catalog','social_discovery','content_studio','approval','support','analytics','security')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','assigned','running','needs_approval','approved','completed','rejected','failed','cancelled')),
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  source_url TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  assigned_to TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_brain_tasks_status_created ON brain_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_brain_tasks_agent_status ON brain_tasks(agent, status);

CREATE TABLE IF NOT EXISTS brain_agent_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES brain_tasks(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started','succeeded','failed','cancelled')),
  provider TEXT,
  input_summary TEXT NOT NULL DEFAULT '',
  output_summary TEXT NOT NULL DEFAULT '',
  error_code TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_brain_runs_task ON brain_agent_runs(task_id, started_at);

CREATE TABLE IF NOT EXISTS brain_approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES brain_tasks(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK(action_type IN ('publish_post','send_reply','send_message','change_price','change_stock','delete_content','launch_ad','other')),
  destination TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','expired','executed','failed')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_brain_approvals_status ON brain_approvals(status, requested_at);

CREATE TABLE IF NOT EXISTS brain_social_sources (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  source_url TEXT NOT NULL,
  creator_name TEXT NOT NULL DEFAULT '',
  rights_status TEXT NOT NULL DEFAULT 'unknown' CHECK(rights_status IN ('unknown','licensed','permission_granted','reference_only','blocked')),
  rights_evidence TEXT NOT NULL DEFAULT '',
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_brain_sources_platform ON brain_social_sources(platform);

CREATE TABLE IF NOT EXISTS brain_content_drafts (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES brain_tasks(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  media_reference TEXT NOT NULL DEFAULT '',
  rights_status TEXT NOT NULL DEFAULT 'original' CHECK(rights_status IN ('original','licensed','permission_granted','reference_only','unknown')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','published','rejected')),
  scheduled_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_brain_drafts_status ON brain_content_drafts(status, created_at);

CREATE TABLE IF NOT EXISTS brain_audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  actor_type TEXT NOT NULL CHECK(actor_type IN ('owner','agent','system')),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_brain_audit_entity ON brain_audit_events(entity_type, entity_id, created_at);

-- OAuth connection metadata only. Access/refresh tokens belong in encrypted platform secrets,
-- never in this table, browser storage, repository files, or logs.
CREATE TABLE IF NOT EXISTS brain_social_connections (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account_label TEXT NOT NULL DEFAULT '',
  external_account_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_connected' CHECK(status IN ('not_connected','connected','expired','revoked','error')),
  granted_scopes TEXT NOT NULL DEFAULT '',
  connected_at TEXT,
  last_checked_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_brain_social_connections_platform ON brain_social_connections(platform, status);

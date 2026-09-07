-- =============================================================================
-- MT5 Scalp Command Center - initial schema (9/12)
-- system_events, audit_logs
-- Neither table may ever contain secrets (passwords, tokens, API keys) - this
-- is enforced by convention in application code (see lib/audit.ts /
-- trading-engine/engine/db/audit.py), not by a DB constraint, since the
-- message/metadata content is free-form.
-- =============================================================================

create table system_events (
  id uuid primary key default gen_random_uuid(),
  component system_component not null,
  event_type text not null,
  severity event_severity not null default 'INFO',
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  account_id uuid references mt5_accounts (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index idx_system_events_component on system_events (component);
create index idx_system_events_created_at on system_events (created_at desc);
create index idx_system_events_severity on system_events (severity);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_user_id on audit_logs (user_id);
create index idx_audit_logs_action on audit_logs (action);
create index idx_audit_logs_created_at on audit_logs (created_at desc);

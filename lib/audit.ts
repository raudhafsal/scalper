import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { EventSeverity, SystemComponent } from '@/types/database';

/**
 * Writes an audit log row. NEVER pass secrets (passwords, tokens, API keys,
 * raw bridge tokens) in `metadata` - this is logged permanently and is
 * readable by the acting user. See spec section 40 / 44.
 */
export async function writeAuditLog(params: {
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from('audit_logs').insert({
    user_id: params.userId,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    metadata: params.metadata ?? {},
    ip_address: params.ipAddress ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log', params.action, error.message);
  }
}

export async function writeSystemEvent(params: {
  component: SystemComponent;
  eventType: string;
  severity?: EventSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  accountId?: string | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from('system_events').insert({
    component: params.component,
    event_type: params.eventType,
    severity: params.severity ?? 'INFO',
    message: params.message,
    metadata: params.metadata ?? {},
    account_id: params.accountId ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to write system event', params.eventType, error.message);
  }
}

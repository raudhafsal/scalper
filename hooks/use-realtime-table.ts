'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * Subscribes to Supabase Realtime changes on a table (optionally filtered)
 * and calls `onChange` for every insert/update/delete. Used to make the
 * dashboard update live when accounts connect/disconnect, signals fire,
 * trades open/close, etc. (spec section 42).
 */
export function useRealtimeTable<T extends object>(
  table: string,
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void,
  filter?: string,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Supabase-js dedupes channels by topic string and returns the SAME
  // channel object to every caller that asks for the same topic. If two
  // components subscribe to the same table+filter (e.g. two widgets both
  // watching `trading_state` for the current user), the second one would
  // get back a channel the first has already called `.subscribe()` on, and
  // `.on()` throws ("cannot add postgres_changes callbacks ... after
  // subscribe()"). A unique suffix per hook instance keeps every caller on
  // its own channel/socket subscription so this can never collide.
  const instanceIdRef = useRef<string>();
  if (!instanceIdRef.current) {
    instanceIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:${table}:${filter ?? 'all'}:${instanceIdRef.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        (payload) => onChangeRef.current(payload as RealtimePostgresChangesPayload<T>),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter]);
}

/** Convenience hook: re-runs `refetch` whenever any row in `table` changes. */
export function useRealtimeRefetch(table: string, refetch: () => void, filter?: string) {
  const [tick, setTick] = useState(0);
  useRealtimeTable(table, () => setTick((t) => t + 1), filter);
  useEffect(() => {
    if (tick > 0) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
}

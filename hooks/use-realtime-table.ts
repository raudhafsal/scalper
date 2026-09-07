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

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:${table}:${filter ?? 'all'}`)
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
